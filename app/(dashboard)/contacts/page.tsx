'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Contact, Room, Property } from '@/lib/types'

type Tab = 'tenants' | 'past' | 'owners' | 'leads' | 'all'

interface OrphanRoom extends Room { property?: Property }
interface ContactWithRoom extends Contact {
  room?: Room & { property?: Property }
  ownedProperty?: Property
}

const SOURCE_LABELS: Record<string, string> = {
  openphone: 'Phone', facebook: 'FB', furnished_finder: 'FF',
  referral: 'Referral', direct: 'Direct',
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', type: 'tenant', status: 'active',
  notes: '', source: '', interested_room_id: '', move_in_date: '', property_id: '',
}

export default function ContactsPage() {
  const supabase = createClient()

  const [contacts, setContacts] = useState<ContactWithRoom[]>([])
  const [rooms, setRooms] = useState<(Room & { property?: Property })[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [orphans, setOrphans] = useState<OrphanRoom[]>([])

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('tenants')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [orphansOpen, setOrphansOpen] = useState(true)

  const load = useCallback(async () => {
    const [contactsRes, roomsRes, propsRes] = await Promise.all([
      supabase.from('contacts').select('*').order('name', { ascending: true }),
      supabase.from('rooms_v2').select('*').order('label'),
      supabase.from('properties_v2').select('*').order('address'),
    ])

    const props: Property[] = propsRes.data ?? []
    const allRooms: Room[] = roomsRes.data ?? []
    const enrichedRooms = allRooms.map(r => ({ ...r, property: props.find(p => p.id === r.property_id) }))
    setProperties(props)
    setRooms(enrichedRooms)

    const allContacts: Contact[] = contactsRes.data ?? []
    const enriched: ContactWithRoom[] = allContacts.map(c => ({
      ...c,
      room: c.interested_room_id ? enrichedRooms.find(r => r.id === c.interested_room_id) : undefined,
      ownedProperty: c.property_id ? props.find(p => p.id === c.property_id) : undefined,
    }))
    setContacts(enriched)

    const tenantNames = new Set(allContacts.filter(c => c.type === 'tenant').map(c => c.name.toLowerCase().trim()))
    setOrphans(
      enrichedRooms
        .filter(r => r.status === 'occupied' && r.tenant_name)
        .filter(r => !tenantNames.has((r.tenant_name ?? '').toLowerCase().trim()))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = contacts.filter(c => {
    if (tab === 'tenants' && !(c.type === 'tenant' && c.status !== 'past')) return false
    if (tab === 'past' && !(c.type === 'tenant' && c.status === 'past')) return false
    if (tab === 'owners' && c.type !== 'owner') return false
    if (tab === 'leads' && c.type !== 'ff_lead') return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q) || false
    }
    return true
  })

  const counts = {
    tenants: contacts.filter(c => c.type === 'tenant' && c.status !== 'past').length,
    past: contacts.filter(c => c.type === 'tenant' && c.status === 'past').length,
    owners: contacts.filter(c => c.type === 'owner').length,
    leads: contacts.filter(c => c.type === 'ff_lead').length,
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload: Record<string, unknown> = {
      name: form.name, phone: form.phone || null, email: form.email || null,
      type: form.type, status: form.status, notes: form.notes || null,
      source: form.source || null,
      interested_room_id: form.type === 'tenant' ? (form.interested_room_id || null) : null,
      move_in_date: form.type === 'tenant' ? (form.move_in_date || null) : null,
      property_id: form.type === 'owner' ? (form.property_id || null) : null,
    }
    const { data } = await supabase.from('contacts').insert([payload]).select().single()
    if (data && form.interested_room_id && form.type === 'tenant') {
      await supabase.from('rooms_v2').update({ tenant_name: form.name }).eq('id', form.interested_room_id)
    }
    if (data) await load()
    setShowAdd(false)
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  async function createFromOrphan(room: OrphanRoom) {
    setSaving(true)
    await supabase.from('contacts').insert([{ name: room.tenant_name!, type: 'tenant', status: 'active', interested_room_id: room.id, move_in_date: room.lease_start ?? null }])
    await load()
    setSaving(false)
  }

  async function syncAllOrphans() {
    if (!orphans.length) return
    setSaving(true)
    await supabase.from('contacts').insert(orphans.map(r => ({ name: r.tenant_name!, type: 'tenant', status: 'active', interested_room_id: r.id, move_in_date: r.lease_start ?? null })))
    await load()
    setSaving(false)
  }

  function startEdit(c: ContactWithRoom) {
    setEditingId(c.id)
    setEditForm({
      name: c.name, phone: c.phone ?? '', email: c.email ?? '', status: c.status,
      notes: c.notes ?? '', interested_room_id: c.interested_room_id ?? '',
      move_in_date: c.move_in_date ?? '', property_id: c.property_id ?? '',
    })
  }

  async function saveEdit(c: ContactWithRoom) {
    setSaving(true)
    const payload: Record<string, unknown> = {
      name: editForm.name, phone: editForm.phone || null, email: editForm.email || null,
      status: editForm.status, notes: editForm.notes || null,
      interested_room_id: c.type === 'tenant' ? (editForm.interested_room_id || null) : null,
      move_in_date: c.type === 'tenant' ? (editForm.move_in_date || null) : null,
      property_id: c.type === 'owner' ? (editForm.property_id || null) : null,
    }
    await supabase.from('contacts').update(payload).eq('id', c.id)
    if (c.type === 'tenant' && editForm.interested_room_id) {
      await supabase.from('rooms_v2').update({ tenant_name: editForm.name }).eq('id', editForm.interested_room_id)
    }
    setEditingId(null)
    setSaving(false)
    load()
  }

  async function markPast(id: string) {
    await supabase.from('contacts').update({ status: 'past' }).eq('id', id)
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: 'past' } : c))
  }

  if (loading) return <div className="p-8 text-sm text-dim animate-pulse">Loading…</div>

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-content">Contacts</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 transition-colors">
          + Add Contact
        </button>
      </div>

      {/* Unlinked tenants */}
      {orphans.length > 0 && (
        <section>
          <button className="w-full flex items-center justify-between py-2 mb-2" onClick={() => setOrphansOpen(o => !o)}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-content">Unlinked Tenants</h2>
              <span className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">{orphans.length}</span>
            </div>
            <span className="text-xs text-dim">{orphansOpen ? '▴' : '▾'}</span>
          </button>
          {orphansOpen && (
            <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-dim">Rooms with a tenant name but no contact record.</p>
                <button disabled={saving} onClick={syncAllOrphans} className="shrink-0 text-sm bg-blue text-white px-3 py-1 rounded-md hover:bg-blue/90 disabled:opacity-50">
                  {saving ? 'Syncing…' : `Sync all (${orphans.length})`}
                </button>
              </div>
              {orphans.map(room => (
                <div key={room.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-content">{room.tenant_name}</div>
                    <div className="text-xs text-dim">{room.label} · {room.property?.address}{room.rent ? ` · $${room.rent.toLocaleString()}/mo` : ''}</div>
                  </div>
                  <button disabled={saving} onClick={() => createFromOrphan(room)} className="text-xs text-blue hover:underline disabled:opacity-50">Create</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addContact} className="border border-edge rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-medium text-content">New Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-dim block mb-1">Full name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md" />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="617-555-0100" className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md" />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md" />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md">
                <option value="tenant">Tenant</option>
                <option value="owner">Property Owner</option>
                <option value="ff_lead">Lead</option>
                <option value="investor">Investor</option>
                <option value="past_client">Past Client</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md">
                <option value="active">Active</option>
                <option value="past">Past</option>
                <option value="nurture">Nurture</option>
              </select>
            </div>

            {form.type === 'tenant' && <>
              <div className="sm:col-span-2">
                <label className="text-xs text-dim block mb-1">Room assignment</label>
                <select value={form.interested_room_id} onChange={e => setForm(f => ({ ...f, interested_room_id: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md">
                  <option value="">No room assigned</option>
                  {properties.map(prop => (
                    <optgroup key={prop.id} label={prop.address}>
                      {rooms.filter(r => r.property_id === prop.id).map(r => (
                        <option key={r.id} value={r.id}>{r.label ?? 'Room'} — {r.status}{r.rent ? ` · $${r.rent.toLocaleString()}/mo` : ''}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-dim block mb-1">Move-in date</label>
                <input type="date" value={form.move_in_date} onChange={e => setForm(f => ({ ...f, move_in_date: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md" />
              </div>
              <div>
                <label className="text-xs text-dim block mb-1">Source</label>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md">
                  <option value="">Unknown</option>
                  <option value="furnished_finder">Furnished Finder</option>
                  <option value="facebook">Facebook</option>
                  <option value="referral">Referral</option>
                  <option value="direct">Direct</option>
                  <option value="openphone">OpenPhone</option>
                </select>
              </div>
            </>}

            {form.type === 'owner' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-dim block mb-1">Property they own</label>
                <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md">
                  <option value="">Select a property</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="text-xs text-dim block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any notes…" className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md resize-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM) }} className="text-sm text-dim hover:text-content">Cancel</button>
          </div>
        </form>
      )}

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, or email…" className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-edge">
        {([
          { key: 'tenants', label: 'Current Tenants', count: counts.tenants },
          { key: 'past', label: 'Past Tenants', count: counts.past },
          { key: 'owners', label: 'Property Owners', count: counts.owners },
          { key: 'leads', label: 'Leads', count: counts.leads },
          { key: 'all', label: 'All', count: contacts.length },
        ] as { key: Tab; label: string; count: number }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-blue text-blue font-medium' : 'border-transparent text-dim hover:text-content'
            }`}
          >
            {t.label} <span className="text-xs opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-dim py-4">No contacts found.</p>
      ) : (
        <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
          {filtered.map(c => {
            const isExpanded = expandedId === c.id
            const isEditing = editingId === c.id

            return (
              <div key={c.id}>
                <button className="w-full text-left px-4 py-3 hover:bg-panel transition-colors" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-content">{c.name}</span>
                        {c.type === 'owner' && <span className="text-xs bg-blue/10 text-blue px-2 py-0.5 rounded-full">Owner</span>}
                        {c.type === 'ff_lead' && <span className="text-xs bg-edge text-dim px-2 py-0.5 rounded-full">Lead</span>}
                        {c.status === 'past' && <span className="text-xs text-fade">Past</span>}
                        {c.type === 'tenant' && c.status !== 'past' && !c.room?.lease_end && (
                          <span className="text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full">TAW</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {c.phone
                          ? <span className="text-xs text-dim">{c.phone}</span>
                          : <span className="text-xs text-warn">No phone</span>
                        }
                        {c.email && <span className="text-xs text-dim">{c.email}</span>}
                        {c.type === 'tenant' && c.room && (
                          <span className="text-xs text-blue">{c.room.label} · {c.room.property?.address}</span>
                        )}
                        {c.type === 'owner' && c.ownedProperty && (
                          <span className="text-xs text-blue">{c.ownedProperty.address}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {c.type === 'tenant' && c.status !== 'past' && c.room?.lease_end && (() => {
                        const days = Math.ceil((new Date(c.room.lease_end).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                        return (
                          <div className={`text-sm font-medium ${days < 30 ? 'text-urgent' : days < 60 ? 'text-warn' : 'text-dim'}`}>
                            {new Date(c.room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                            <div className="text-xs font-normal">{days}d left</div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </button>

                {isExpanded && !isEditing && (
                  <div className="px-4 pb-3 pt-1 border-t border-edge bg-panel space-y-2">
                    {c.notes && <p className="text-xs text-dim">{c.notes}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => startEdit(c)} className="text-xs text-blue hover:underline">Edit</button>
                      {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-dim hover:text-content">Call</a>}
                      {c.type === 'tenant' && c.status !== 'past' && (
                        <button onClick={() => markPast(c.id)} className="text-xs text-dim hover:text-urgent">Move to past tenants</button>
                      )}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="px-4 pb-4 pt-3 border-t border-edge bg-panel space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-dim block mb-1">Full name</label>
                        <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                      </div>
                      <div>
                        <label className="text-xs text-dim block mb-1">Phone</label>
                        <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="617-555-0100" className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                      </div>
                      <div>
                        <label className="text-xs text-dim block mb-1">Email</label>
                        <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                      </div>
                      <div>
                        <label className="text-xs text-dim block mb-1">Status</label>
                        <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md">
                          <option value="active">Active</option>
                          <option value="past">Past</option>
                          <option value="nurture">Nurture</option>
                        </select>
                      </div>
                      {c.type === 'tenant' && <>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-dim block mb-1">Room assignment</label>
                          <select value={editForm.interested_room_id} onChange={e => setEditForm(f => ({ ...f, interested_room_id: e.target.value }))} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md">
                            <option value="">No room assigned</option>
                            {properties.map(prop => (
                              <optgroup key={prop.id} label={prop.address}>
                                {rooms.filter(r => r.property_id === prop.id).map(r => (
                                  <option key={r.id} value={r.id}>{r.label ?? 'Room'} — {r.status}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-dim block mb-1">Move-in date</label>
                          <input type="date" value={editForm.move_in_date} onChange={e => setEditForm(f => ({ ...f, move_in_date: e.target.value }))} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md" />
                        </div>
                      </>}
                      {c.type === 'owner' && (
                        <div className="sm:col-span-2">
                          <label className="text-xs text-dim block mb-1">Property they own</label>
                          <select value={editForm.property_id} onChange={e => setEditForm(f => ({ ...f, property_id: e.target.value }))} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md">
                            <option value="">Select a property</option>
                            {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <label className="text-xs text-dim block mb-1">Notes</label>
                        <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md resize-none" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button disabled={saving} onClick={() => saveEdit(c)} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} className="text-sm text-dim hover:text-content">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
