'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Room, Property, Contact } from '@/lib/types'

interface RoomWithLeads extends Room {
  property?: Property
  leads: Contact[]
}

interface IncompleteRoom extends Room {
  property?: Property
  missing: string[]
}

interface IncompleteTenant extends Contact {
  missing: string[]
}

const RENEWAL_COLORS: Record<string, string> = {
  unknown: 'text-dim',
  not_extending: 'text-urgent',
  possibly_extending: 'text-warn',
  confirmed: 'text-good',
  renewed: 'text-good',
}

const STAGE_COLORS: Record<string, string> = {
  inquiry: 'text-dim',
  showing_scheduled: 'text-warn',
  showed: 'text-blue',
  applied: 'text-content',
  approved: 'text-good',
  placed: 'text-good',
  lost: 'text-urgent',
}

const STAGE_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  showing_scheduled: 'Showing',
  showed: 'Showed',
  applied: 'Applied',
  approved: 'Approved',
  placed: 'Placed',
  lost: 'Lost',
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

function daysVacant(createdAt: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const created = new Date(createdAt); created.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - created.getTime()) / 86400000)
}

function roomMissing(r: Room): string[] {
  const fields: string[] = []
  if (!r.tenant_name) fields.push('Tenant name')
  if (!r.rent) fields.push('Monthly rent')
  if (!r.lease_start) fields.push('Lease start')
  if (!r.lease_end) fields.push('Lease end')
  return fields
}

function tenantMissing(c: Contact): string[] {
  const fields: string[] = []
  if (!c.phone) fields.push('Phone')
  if (!c.email) fields.push('Email')
  return fields
}

export default function RentalLaunchPage() {
  const supabase = createClient()

  // Vacancy data
  const [vacantRooms, setVacantRooms] = useState<RoomWithLeads[]>([])
  const [expiringRooms, setExpiringRooms] = useState<RoomWithLeads[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingLeadFor, setAddingLeadFor] = useState<string | null>(null)
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', source: 'furnished_finder' })
  const [savingLead, setSavingLead] = useState(false)

  // Incomplete records
  const [incompleteRooms, setIncompleteRooms] = useState<IncompleteRoom[]>([])
  const [incompleteTenants, setIncompleteTenants] = useState<IncompleteTenant[]>([])
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [roomForm, setRoomForm] = useState({ tenant_name: '', rent: '', lease_start: '', lease_end: '' })
  const [contactForm, setContactForm] = useState({ phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [gapsOpen, setGapsOpen] = useState(true)
  const [tawRooms, setTawRooms] = useState<(Room & { property?: Property })[]>([])
  const [tawOpen, setTawOpen] = useState(true)

  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = new Date()
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const [vacantRes, expiringRes, propsRes, leadsRes, occupiedRes, tenantsRes, tawRes] = await Promise.all([
      supabase.from('rooms_v2').select('*').eq('status', 'vacant').order('label'),
      supabase
        .from('rooms_v2').select('*').eq('status', 'occupied')
        .lte('lease_end', in60.toISOString().split('T')[0])
        .not('lease_end', 'is', null)
        .order('lease_end', { ascending: true }),
      supabase.from('properties_v2').select('*'),
      supabase
        .from('contacts').select('*')
        .eq('type', 'ff_lead').neq('status', 'past')
        .not('interested_room_id', 'is', null),
      supabase.from('rooms_v2').select('*').eq('status', 'occupied').order('label'),
      supabase.from('contacts').select('*').eq('type', 'tenant').eq('status', 'active'),
      supabase.from('rooms_v2').select('*').eq('status', 'occupied').is('lease_end', null).order('label'),
    ])

    const props: Property[] = propsRes.data ?? []
    const leads: Contact[] = leadsRes.data ?? []

    function enrich(rooms: Room[]): RoomWithLeads[] {
      return rooms.map(room => ({
        ...room,
        property: props.find(p => p.id === room.property_id),
        leads: leads.filter(l => l.interested_room_id === room.id),
      }))
    }

    if (vacantRes.data) setVacantRooms(enrich(vacantRes.data as Room[]))
    if (expiringRes.data) setExpiringRooms(enrich(expiringRes.data as Room[]))

    // Incomplete rooms
    if (occupiedRes.data) {
      const incomplete = (occupiedRes.data as Room[])
        .map(r => ({ ...r, property: props.find(p => p.id === r.property_id), missing: roomMissing(r) }))
        .filter(r => r.missing.length > 0)
      setIncompleteRooms(incomplete)
    }

    // Incomplete tenant contacts
    if (tenantsRes.data) {
      const incomplete = (tenantsRes.data as Contact[])
        .map(c => ({ ...c, missing: tenantMissing(c) }))
        .filter(c => c.missing.length > 0)
      setIncompleteTenants(incomplete)
    }

    // TAW rooms (occupied, no lease_end)
    if (tawRes.data) {
      setTawRooms((tawRes.data as Room[]).map(r => ({
        ...r, property: props.find(p => p.id === r.property_id),
      })))
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function quickAddLead(roomId: string) {
    if (!leadForm.name.trim()) return
    setSavingLead(true)
    const { data } = await supabase.from('contacts').insert([{
      name: leadForm.name, phone: leadForm.phone || null,
      source: leadForm.source, type: 'ff_lead', status: 'active',
      lead_stage: 'inquiry', interested_room_id: roomId,
    }]).select().single()
    if (data) {
      const newLead = data as Contact
      const addTo = (rooms: RoomWithLeads[]) =>
        rooms.map(r => r.id === roomId ? { ...r, leads: [...r.leads, newLead] } : r)
      setVacantRooms(addTo)
      setExpiringRooms(addTo)
    }
    setAddingLeadFor(null)
    setLeadForm({ name: '', phone: '', source: 'furnished_finder' })
    setSavingLead(false)
  }

  async function saveRoom(roomId: string) {
    setSaving(true)
    const payload: Record<string, unknown> = {}
    if (roomForm.tenant_name) payload.tenant_name = roomForm.tenant_name
    if (roomForm.rent) payload.rent = parseFloat(roomForm.rent)
    if (roomForm.lease_start) payload.lease_start = roomForm.lease_start
    if (roomForm.lease_end) payload.lease_end = roomForm.lease_end

    await supabase.from('rooms_v2').update(payload).eq('id', roomId)
    setEditingRoomId(null)
    setSaving(false)
    load()
  }

  async function saveContact(contactId: string) {
    setSaving(true)
    const payload: Record<string, unknown> = {}
    if (contactForm.phone) payload.phone = contactForm.phone
    if (contactForm.email) payload.email = contactForm.email

    await supabase.from('contacts').update(payload).eq('id', contactId)
    setEditingContactId(null)
    setSaving(false)
    load()
  }

  const gapCount = incompleteRooms.length + incompleteTenants.length
  const monthlyLost = vacantRooms.reduce((sum, r) => sum + (r.rent ?? 0), 0)
  const dailyLost = Math.round(monthlyLost / 30)
  const atRisk = expiringRooms.filter(r =>
    r.renewal_status === 'not_extending' || r.renewal_status === 'unknown'
  ).length
  const tawCount = tawRooms.length

  if (loading) return <div className="p-8 text-sm text-dim animate-pulse">Loading…</div>

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dim mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold text-content">Rental Launch</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full bg-good" />
          <span className="text-xs text-good">OpenPhone active</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-10 border-b border-edge pb-6">
        {[
          { label: 'Vacant now', value: vacantRooms.length, color: vacantRooms.length > 0 ? 'text-urgent' : 'text-good' },
          { label: 'Lost / month', value: monthlyLost > 0 ? `$${monthlyLost.toLocaleString()}` : '—', color: monthlyLost > 0 ? 'text-urgent' : 'text-dim' },
          { label: 'Expiring soon', value: expiringRooms.length, color: expiringRooms.length > 0 ? 'text-warn' : 'text-good' },
          { label: 'At will (TAW)', value: tawCount, color: tawCount > 0 ? 'text-warn' : 'text-good' },
          { label: 'Data gaps', value: gapCount, color: gapCount > 0 ? 'text-warn' : 'text-good' },
        ].map(s => (
          <div key={s.label}>
            <div className={`text-2xl font-semibold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-dim mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Incomplete Records */}
      {gapCount > 0 && (
        <section>
          <button
            className="w-full flex items-center justify-between py-2 mb-2"
            onClick={() => setGapsOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-content">Missing Info</h2>
              <span className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">{gapCount}</span>
            </div>
            <span className="text-xs text-dim">{gapsOpen ? '▴' : '▾'}</span>
          </button>

          {gapsOpen && (
            <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
              {incompleteRooms.map(room => {
                const isEditing = editingRoomId === room.id
                return (
                  <div key={room.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-content">{room.label ?? 'Room'} <span className="font-normal text-dim">· {room.property?.address}</span></div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {room.missing.map(f => (
                            <span key={f} className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">{f}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (isEditing) { setEditingRoomId(null); return }
                          setEditingRoomId(room.id)
                          setRoomForm({ tenant_name: room.tenant_name ?? '', rent: room.rent ? String(room.rent) : '', lease_start: room.lease_start ?? '', lease_end: room.lease_end ?? '' })
                        }}
                        className="shrink-0 text-xs text-blue hover:underline"
                      >
                        {isEditing ? 'Cancel' : 'Fill in'}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Tenant name', key: 'tenant_name', type: 'text', placeholder: 'Full name' },
                            { label: 'Monthly rent', key: 'rent', type: 'number', placeholder: '1800' },
                            { label: 'Lease start', key: 'lease_start', type: 'date', placeholder: '' },
                            { label: 'Lease end', key: 'lease_end', type: 'date', placeholder: '' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="text-xs text-dim block mb-1">{f.label}</label>
                              <input type={f.type} value={roomForm[f.key as keyof typeof roomForm]} onChange={e => setRoomForm(r => ({ ...r, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full border border-edge px-3 py-1.5 text-sm text-content focus:outline-none focus:border-blue" />
                            </div>
                          ))}
                        </div>
                        <button disabled={saving} onClick={() => saveRoom(room.id)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {incompleteTenants.map(contact => {
                const isEditing = editingContactId === contact.id
                return (
                  <div key={contact.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-content">{contact.name} <span className="font-normal text-dim">· Tenant</span></div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {contact.missing.map(f => (
                            <span key={f} className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">{f}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (isEditing) { setEditingContactId(null); return }
                          setEditingContactId(contact.id)
                          setContactForm({ phone: contact.phone ?? '', email: contact.email ?? '' })
                        }}
                        className="shrink-0 text-xs text-blue hover:underline"
                      >
                        {isEditing ? 'Cancel' : 'Fill in'}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-dim block mb-1">Phone</label>
                            <input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="617-555-0100" className="w-full border border-edge px-3 py-1.5 text-sm text-content focus:outline-none focus:border-blue" />
                          </div>
                          <div>
                            <label className="text-xs text-dim block mb-1">Email</label>
                            <input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="w-full border border-edge px-3 py-1.5 text-sm text-content focus:outline-none focus:border-blue" />
                          </div>
                        </div>
                        <button disabled={saving} onClick={() => saveContact(contact.id)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* TAW */}
      {tawCount > 0 && (
        <section>
          <button className="w-full flex items-center justify-between py-2 mb-2" onClick={() => setTawOpen(o => !o)}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-content">Tenants At Will</h2>
              <span className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">{tawCount}</span>
            </div>
            <span className="text-xs text-dim">{tawOpen ? '▴' : '▾'}</span>
          </button>
          {tawOpen && (
            <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
              <p className="px-4 py-2.5 text-xs text-dim">No lease end date — month-to-month tenancy. Add a lease end date in the room to convert from TAW.</p>
              {tawRooms.map(room => (
                <div key={room.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-content">{room.tenant_name ?? 'Unknown'}</div>
                    <div className="text-xs text-dim mt-0.5">
                      {room.label} · {room.property?.address}{room.rent ? ` · $${room.rent.toLocaleString()}/mo` : ''}
                    </div>
                    {room.lease_start && (
                      <div className="text-xs text-fade mt-0.5">Since {new Date(room.lease_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
                    )}
                  </div>
                  <span className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full shrink-0">TAW</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Vacant rooms */}
      <section>
        <div className="flex items-center justify-between py-2 mb-2">
          <h2 className="text-sm font-medium text-content">
            Vacant now
            {vacantRooms.length > 0 && <span className="ml-2 text-urgent font-normal text-xs">${dailyLost.toLocaleString()}/day</span>}
          </h2>
          {vacantRooms.length === 0 && <span className="text-xs text-good">All filled</span>}
        </div>

        {vacantRooms.length === 0 ? (
          <p className="text-sm text-dim py-2">No vacant rooms right now.</p>
        ) : (
          <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
            {vacantRooms.map(room => {
              const activeLeads = room.leads.filter(l => l.lead_stage !== 'lost' && l.lead_stage !== 'placed')
              const isExpanded = expandedId === room.id
              const isAddingLead = addingLeadFor === room.id
              const vacant = daysVacant(room.created_at)

              return (
                <div key={room.id}>
                  <button className="w-full text-left px-4 py-3 hover:bg-panel transition-colors" onClick={() => setExpandedId(isExpanded ? null : room.id)}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-content">{room.label ?? 'Room'} <span className="font-normal text-dim">· {room.property?.address}</span></div>
                        <div className="text-xs text-dim mt-0.5 flex gap-3">
                          {room.rent ? <span>${room.rent.toLocaleString()}/mo</span> : <span className="text-warn">No rent set</span>}
                          <span className="text-urgent">{vacant}d vacant</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-sm font-semibold ${activeLeads.length > 0 ? 'text-good' : 'text-urgent'}`}>{activeLeads.length}</span>
                        <span className="text-xs text-dim ml-1">leads</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-edge space-y-3 bg-panel">
                      {room.leads.length === 0 ? (
                        <p className="text-xs text-dim">No leads for this room yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {room.leads.map(lead => (
                            <div key={lead.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-3">
                                <span className="text-content">{lead.name}</span>
                                {lead.phone && <span className="text-dim text-xs">{lead.phone}</span>}
                              </div>
                              <span className={`text-xs ${lead.lead_stage ? (STAGE_COLORS[lead.lead_stage] ?? 'text-dim') : 'text-dim'}`}>
                                {lead.lead_stage ? (STAGE_LABELS[lead.lead_stage] ?? lead.lead_stage) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {isAddingLead ? (
                        <div className="space-y-2 pt-2 border-t border-edge">
                          <div className="grid grid-cols-3 gap-2">
                            <input value={leadForm.name} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                            <input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                            <select value={leadForm.source} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))} className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md">
                              <option value="furnished_finder">Furnished Finder</option>
                              <option value="facebook">Facebook</option>
                              <option value="referral">Referral</option>
                              <option value="direct">Direct</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button disabled={!leadForm.name.trim() || savingLead} onClick={() => quickAddLead(room.id)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">
                              {savingLead ? '…' : 'Add'}
                            </button>
                            <button onClick={() => setAddingLeadFor(null)} className="text-sm text-dim hover:text-content">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingLeadFor(room.id); setLeadForm({ name: '', phone: '', source: 'furnished_finder' }) }} className="text-xs text-blue hover:underline">
                          + Add lead for this room
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Expiring leases */}
      <section>
        <div className="flex items-center justify-between py-2 mb-2">
          <h2 className="text-sm font-medium text-content">Expiring in 60 days</h2>
          {expiringRooms.length === 0 && <span className="text-xs text-good">None</span>}
        </div>

        {expiringRooms.length === 0 ? (
          <p className="text-sm text-dim py-2">No leases expiring in the next 60 days.</p>
        ) : (
          <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
            {expiringRooms.map(room => {
              const days = room.lease_end ? daysUntil(room.lease_end) : null
              const activeLeads = room.leads.filter(l => l.lead_stage !== 'lost' && l.lead_stage !== 'placed')
              const isExpanded = expandedId === room.id
              const isAddingLead = addingLeadFor === room.id
              const urgent = days !== null && days < 30

              return (
                <div key={room.id}>
                  <button className="w-full text-left px-4 py-3 hover:bg-panel transition-colors" onClick={() => setExpandedId(isExpanded ? null : room.id)}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-content">{room.tenant_name ?? room.label ?? 'Room'} <span className="font-normal text-dim">· {room.property?.address}</span></div>
                        <div className="text-xs text-dim mt-0.5 flex gap-3">
                          {room.rent && <span>${room.rent.toLocaleString()}/mo</span>}
                          {room.renewal_status && room.renewal_status !== 'unknown' && (
                            <span className={RENEWAL_COLORS[room.renewal_status] ?? 'text-dim'}>{room.renewal_status.replace('_', ' ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {days !== null && (
                          <div className={`text-sm font-semibold ${urgent ? 'text-urgent' : 'text-warn'}`}>{days}d</div>
                        )}
                        {room.lease_end && (
                          <div className="text-xs text-dim">{new Date(room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        )}
                        <div className="text-xs text-dim mt-0.5">{activeLeads.length} leads</div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-edge space-y-3 bg-panel">
                      {room.leads.length === 0 ? (
                        <p className="text-xs text-dim">No leads assigned yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {room.leads.map(lead => (
                            <div key={lead.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-3">
                                <span className="text-content">{lead.name}</span>
                                {lead.phone && <span className="text-dim text-xs">{lead.phone}</span>}
                              </div>
                              <span className={`text-xs ${lead.lead_stage ? (STAGE_COLORS[lead.lead_stage] ?? 'text-dim') : 'text-dim'}`}>
                                {lead.lead_stage ? (STAGE_LABELS[lead.lead_stage] ?? lead.lead_stage) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {isAddingLead ? (
                        <div className="space-y-2 pt-2 border-t border-edge">
                          <div className="grid grid-cols-3 gap-2">
                            <input value={leadForm.name} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                            <input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                            <select value={leadForm.source} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))} className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md">
                              <option value="furnished_finder">Furnished Finder</option>
                              <option value="facebook">Facebook</option>
                              <option value="referral">Referral</option>
                              <option value="direct">Direct</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button disabled={!leadForm.name.trim() || savingLead} onClick={() => quickAddLead(room.id)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">
                              {savingLead ? '…' : 'Add'}
                            </button>
                            <button onClick={() => setAddingLeadFor(null)} className="text-sm text-dim hover:text-content">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingLeadFor(room.id); setLeadForm({ name: '', phone: '', source: 'furnished_finder' }) }} className="text-xs text-blue hover:underline">
                          + Add lead for this room
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex gap-4 pt-2">
        <Link href="/leads" className="text-xs text-dim hover:text-content">All Leads →</Link>
      </div>

    </div>
  )
}
