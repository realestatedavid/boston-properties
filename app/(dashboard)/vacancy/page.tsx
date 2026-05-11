'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Room, Property, Contact } from '@/lib/types'

interface RoomWithLeads extends Room {
  property?: Property
  leads: Contact[]
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

const RENEWAL_COLORS: Record<string, string> = {
  unknown: 'text-dim',
  not_extending: 'text-urgent',
  possibly_extending: 'text-warn',
  confirmed: 'text-good',
  renewed: 'text-good',
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function VacancyPage() {
  const supabase = createClient()
  const [vacantRooms, setVacantRooms] = useState<RoomWithLeads[]>([])
  const [expiringRooms, setExpiringRooms] = useState<RoomWithLeads[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingLeadFor, setAddingLeadFor] = useState<string | null>(null)
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', source: 'furnished_finder' })
  const [savingLead, setSavingLead] = useState(false)

  const load = useCallback(async () => {
    const today = new Date()
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const [vacantRes, expiringRes, propsRes, leadsRes] = await Promise.all([
      supabase.from('rooms_v2').select('*').eq('status', 'vacant').order('label'),
      supabase
        .from('rooms_v2')
        .select('*')
        .eq('status', 'occupied')
        .lte('lease_end', in60.toISOString().split('T')[0])
        .not('lease_end', 'is', null)
        .order('lease_end', { ascending: true }),
      supabase.from('properties_v2').select('*'),
      supabase
        .from('contacts')
        .select('*')
        .in('type', ['ff_lead', 'tenant'])
        .neq('status', 'past')
        .not('interested_room_id', 'is', null),
    ])

    const props: Property[] = propsRes.data ?? []
    const leads: Contact[] = leadsRes.data ?? []

    function enrichRooms(rooms: Room[]): RoomWithLeads[] {
      return rooms.map(room => ({
        ...room,
        property: props.find(p => p.id === room.property_id),
        leads: leads.filter(l => l.interested_room_id === room.id),
      }))
    }

    if (vacantRes.data) setVacantRooms(enrichRooms(vacantRes.data as Room[]))
    if (expiringRes.data) setExpiringRooms(enrichRooms(expiringRes.data as Room[]))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function quickAddLead(roomId: string) {
    setSavingLead(true)
    const { data } = await supabase.from('contacts').insert([{
      name: leadForm.name,
      phone: leadForm.phone || null,
      source: leadForm.source,
      type: 'ff_lead',
      status: 'active',
      lead_stage: 'inquiry',
      interested_room_id: roomId,
    }]).select().single()

    if (data) {
      const newLead = data as Contact
      const addToRoom = (rooms: RoomWithLeads[]) =>
        rooms.map(r => r.id === roomId ? { ...r, leads: [...r.leads, newLead] } : r)
      setVacantRooms(addToRoom)
      setExpiringRooms(addToRoom)
    }
    setAddingLeadFor(null)
    setLeadForm({ name: '', phone: '', source: 'furnished_finder' })
    setSavingLead(false)
  }

  const totalVacant = vacantRooms.length
  const totalExpiring = expiringRooms.length
  const atRisk = expiringRooms.filter(r => r.renewal_status === 'not_extending' || r.renewal_status === 'unknown').length

  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-medium text-content">Vacancy</h1>
        <div className="text-xs text-dim mt-1 uppercase tracking-widest">Risk dashboard</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-edge">
        <div className="bg-panel p-4 text-center">
          <div className={`text-2xl font-medium ${totalVacant > 0 ? 'text-urgent' : 'text-good'}`}>{totalVacant}</div>
          <div className="text-[10px] text-dim uppercase tracking-widest mt-1">Currently Vacant</div>
        </div>
        <div className="bg-panel p-4 text-center">
          <div className={`text-2xl font-medium ${totalExpiring > 0 ? 'text-warn' : 'text-good'}`}>{totalExpiring}</div>
          <div className="text-[10px] text-dim uppercase tracking-widest mt-1">Expiring in 60d</div>
        </div>
        <div className="bg-panel p-4 text-center">
          <div className={`text-2xl font-medium ${atRisk > 0 ? 'text-urgent' : 'text-good'}`}>{atRisk}</div>
          <div className="text-[10px] text-dim uppercase tracking-widest mt-1">At Risk</div>
        </div>
      </div>

      {/* Vacant rooms */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs text-dim uppercase tracking-widest">Currently Vacant</h2>
          {totalVacant === 0 && <span className="text-[10px] text-good uppercase tracking-widest">✓ All filled</span>}
        </div>
        {totalVacant === 0 ? (
          <div className="text-xs text-dim border border-edge p-4">No vacant rooms right now.</div>
        ) : (
          <div className="space-y-px">
            {vacantRooms.map(room => (
              <RoomRow
                key={room.id}
                room={room}
                isExpanded={expandedId === room.id}
                onToggle={() => setExpandedId(expandedId === room.id ? null : room.id)}
                addingLead={addingLeadFor === room.id}
                onStartAddLead={() => { setAddingLeadFor(room.id); setLeadForm({ name: '', phone: '', source: 'furnished_finder' }) }}
                onCancelAddLead={() => setAddingLeadFor(null)}
                leadForm={leadForm}
                onLeadFormChange={setLeadForm}
                onSaveLead={() => quickAddLead(room.id)}
                savingLead={savingLead}
                showDays={false}
              />
            ))}
          </div>
        )}
      </section>

      {/* Expiring leases */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs text-dim uppercase tracking-widest">Leases Expiring in 60 Days</h2>
          {totalExpiring === 0 && <span className="text-[10px] text-good uppercase tracking-widest">✓ None</span>}
        </div>
        {totalExpiring === 0 ? (
          <div className="text-xs text-dim border border-edge p-4">No leases expiring in the next 60 days.</div>
        ) : (
          <div className="space-y-px">
            {expiringRooms.map(room => (
              <RoomRow
                key={room.id}
                room={room}
                isExpanded={expandedId === room.id}
                onToggle={() => setExpandedId(expandedId === room.id ? null : room.id)}
                addingLead={addingLeadFor === room.id}
                onStartAddLead={() => { setAddingLeadFor(room.id); setLeadForm({ name: '', phone: '', source: 'furnished_finder' }) }}
                onCancelAddLead={() => setAddingLeadFor(null)}
                leadForm={leadForm}
                onLeadFormChange={setLeadForm}
                onSaveLead={() => quickAddLead(room.id)}
                savingLead={savingLead}
                showDays={true}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

interface RoomRowProps {
  room: RoomWithLeads
  isExpanded: boolean
  onToggle: () => void
  addingLead: boolean
  onStartAddLead: () => void
  onCancelAddLead: () => void
  leadForm: { name: string; phone: string; source: string }
  onLeadFormChange: (f: { name: string; phone: string; source: string }) => void
  onSaveLead: () => void
  savingLead: boolean
  showDays: boolean
}

function RoomRow({ room, isExpanded, onToggle, addingLead, onStartAddLead, onCancelAddLead, leadForm, onLeadFormChange, onSaveLead, savingLead, showDays }: RoomRowProps) {
  const activeLeads = room.leads.filter(l => l.lead_stage !== 'lost' && l.lead_stage !== 'placed')
  const days = showDays && room.lease_end ? daysUntil(room.lease_end) : null

  return (
    <div className="border border-edge">
      <button className="w-full text-left p-3 hover:bg-panel/30 transition-colors" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-content font-medium">{room.label ?? 'Room'}</span>
              <span className="text-[10px] text-dim truncate">{room.property?.address}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {room.tenant_name && <span className="text-[10px] text-dim">{room.tenant_name}</span>}
              {room.rent && <span className="text-[10px] text-content">${room.rent.toLocaleString()}/mo</span>}
              {room.renewal_status && (
                <span className={`text-[10px] uppercase tracking-widest ${RENEWAL_COLORS[room.renewal_status] ?? 'text-dim'}`}>
                  {room.renewal_status.replace('_', ' ')}
                </span>
              )}
              {showDays && room.lease_end && (
                <span className={`text-[10px] uppercase tracking-widest ${days !== null && days < 30 ? 'text-urgent' : 'text-warn'}`}>
                  {new Date(room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {days}d
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-sm font-medium ${activeLeads.length > 0 ? 'text-good' : 'text-urgent'}`}>
              {activeLeads.length}
            </div>
            <div className="text-[9px] text-dim uppercase tracking-widest">leads</div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-edge px-3 pb-3 pt-2 space-y-3">
          {/* Lead list */}
          {room.leads.length === 0 ? (
            <div className="text-[10px] text-dim">No leads assigned to this room yet.</div>
          ) : (
            <div className="space-y-1">
              {room.leads.map(lead => (
                <div key={lead.id} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-content">{lead.name}</span>
                    {lead.phone && <span className="text-dim">{lead.phone}</span>}
                  </div>
                  <span className={`uppercase tracking-widest ${lead.lead_stage ? (STAGE_COLORS[lead.lead_stage] ?? 'text-dim') : 'text-dim'}`}>
                    {lead.lead_stage ? (STAGE_LABELS[lead.lead_stage] ?? lead.lead_stage) : 'No stage'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick add lead */}
          {addingLead ? (
            <div className="space-y-2 border-t border-edge pt-2">
              <div className="text-[9px] text-fade uppercase tracking-widest">Add lead for this room</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  required
                  value={leadForm.name}
                  onChange={e => onLeadFormChange({ ...leadForm, name: e.target.value })}
                  placeholder="Name *"
                  className="bg-dark border border-edge px-2 py-1.5 text-xs text-content focus:border-blue outline-none"
                />
                <input
                  value={leadForm.phone}
                  onChange={e => onLeadFormChange({ ...leadForm, phone: e.target.value })}
                  placeholder="Phone"
                  className="bg-dark border border-edge px-2 py-1.5 text-xs text-content focus:border-blue outline-none"
                />
                <select
                  value={leadForm.source}
                  onChange={e => onLeadFormChange({ ...leadForm, source: e.target.value })}
                  className="bg-dark border border-edge px-2 py-1.5 text-xs text-content focus:border-blue outline-none"
                >
                  <option value="furnished_finder">Furnished Finder</option>
                  <option value="facebook">Facebook</option>
                  <option value="referral">Referral</option>
                  <option value="direct">Direct</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!leadForm.name || savingLead}
                  onClick={onSaveLead}
                  className="text-[10px] bg-blue text-white px-3 py-1 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest"
                >
                  {savingLead ? '...' : 'Add'}
                </button>
                <button onClick={onCancelAddLead} className="text-[10px] text-dim hover:text-content px-3 py-1 uppercase tracking-widest">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onStartAddLead}
              className="text-[10px] text-dim border border-edge px-2.5 py-1 hover:text-content hover:border-blue/50 transition-colors uppercase tracking-widest"
            >
              + Add Lead for this Room
            </button>
          )}
        </div>
      )}
    </div>
  )
}
