'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Contact, Room, Property } from '@/lib/types'
import type { ParsedLead } from '@/app/api/leads/parse-email/route'

type LeadStage = 'inquiry' | 'showing_scheduled' | 'showed' | 'applied' | 'approved' | 'placed' | 'lost'

const STAGES: LeadStage[] = ['inquiry', 'showing_scheduled', 'showed', 'applied', 'approved', 'placed', 'lost']

const STAGE_LABELS: Record<LeadStage, string> = {
  inquiry: 'Inquiry',
  showing_scheduled: 'Showing Sched.',
  showed: 'Showed',
  applied: 'Applied',
  approved: 'Approved',
  placed: 'Placed',
  lost: 'Lost',
}

const STAGE_COLORS: Record<LeadStage, string> = {
  inquiry: 'text-dim',
  showing_scheduled: 'text-warn',
  showed: 'text-blue',
  applied: 'text-content',
  approved: 'text-good',
  placed: 'text-good',
  lost: 'text-urgent',
}

const SOURCE_LABELS: Record<string, string> = {
  openphone: 'Phone',
  facebook: 'FB',
  furnished_finder: 'FF',
  referral: 'Referral',
  direct: 'Direct',
}

export default function LeadsPage() {
  const supabase = createClient()
  const [leads, setLeads] = useState<Contact[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState<LeadStage | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showEmailParse, setShowEmailParse] = useState(false)
  const [emailText, setEmailText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: 'furnished_finder',
    budget: '', move_in_date: '', interested_room_id: '', notes: '',
  })

  const load = useCallback(async () => {
    const [leadsRes, roomsRes, propsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('type', 'ff_lead')
        .neq('status', 'past')
        .order('created_at', { ascending: false }),
      supabase.from('rooms_v2').select('*').order('label'),
      supabase.from('properties_v2').select('*').order('address'),
    ])
    if (leadsRes.data) setLeads(leadsRes.data as Contact[])
    if (roomsRes.data) setRooms(roomsRes.data as Room[])
    if (propsRes.data) setProperties(propsRes.data as Property[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function parseEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!emailText.trim()) return
    setParsing(true)
    const res = await fetch('/api/leads/parse-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailText }),
    })
    const parsed: ParsedLead = await res.json()
    setForm({
      name: parsed.name ?? '',
      phone: parsed.phone ?? '',
      email: parsed.email ?? '',
      source: parsed.source ?? 'furnished_finder',
      budget: parsed.budget ? String(parsed.budget) : '',
      move_in_date: parsed.move_in_date ?? '',
      interested_room_id: '',
      notes: parsed.notes ?? '',
    })
    setShowEmailParse(false)
    setEmailText('')
    setShowAdd(true)
    setParsing(false)
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload: Record<string, unknown> = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source || null,
      type: 'ff_lead',
      status: 'active',
      lead_stage: 'inquiry',
      notes: form.notes || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      move_in_date: form.move_in_date || null,
      interested_room_id: form.interested_room_id || null,
    }
    const { data } = await supabase.from('contacts').insert([payload]).select().single()
    if (data) setLeads(prev => [data as Contact, ...prev])
    setShowAdd(false)
    setForm({ name: '', phone: '', email: '', source: 'furnished_finder', budget: '', move_in_date: '', interested_room_id: '', notes: '' })
    setSaving(false)
  }

  async function updateStage(id: string, stage: LeadStage) {
    await supabase.from('contacts').update({ lead_stage: stage }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, lead_stage: stage } : l))
  }

  async function logNote(lead: Contact) {
    const note = prompt(`Log a note for ${lead.name}:`)
    if (!note) return
    const updated = lead.notes ? `${lead.notes}\n[${new Date().toLocaleDateString()}] ${note}` : `[${new Date().toLocaleDateString()}] ${note}`
    await supabase.from('contacts').update({ notes: updated, last_contact: new Date().toISOString().split('T')[0] }).eq('id', lead.id)
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, notes: updated, last_contact: new Date().toISOString().split('T')[0] } : l))
  }

  function roomLabel(roomId: string | null) {
    if (!roomId) return null
    const room = rooms.find(r => r.id === roomId)
    if (!room) return null
    const prop = properties.find(p => p.id === room.property_id)
    return `${prop?.address ?? ''} — ${room.label ?? 'Room'}`
  }

  const filtered = leads.filter(l => {
    if (activeStage !== 'all' && l.lead_stage !== activeStage) return false
    if (search) {
      const q = search.toLowerCase()
      return l.name.toLowerCase().includes(q) || l.phone?.includes(q) || false
    }
    return true
  })

  const countByStage = (stage: LeadStage) => leads.filter(l => l.lead_stage === stage).length
  const noStage = leads.filter(l => !l.lead_stage).length

  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Leads</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">{leads.length} rental leads</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowEmailParse(!showEmailParse); setShowAdd(false) }}
            className="text-xs border border-blue text-blue px-3 py-1.5 hover:bg-blue/10 transition-colors uppercase tracking-widest"
          >
            Parse Email
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowEmailParse(false) }}
            className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 transition-colors uppercase tracking-widest"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Stage summary strip */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-px bg-edge">
        {STAGES.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(activeStage === stage ? 'all' : stage)}
            className={`bg-panel p-2 text-center transition-colors hover:bg-edge/50 ${activeStage === stage ? 'ring-1 ring-blue' : ''}`}
          >
            <div className={`text-lg font-medium ${STAGE_COLORS[stage]}`}>{countByStage(stage)}</div>
            <div className="text-[9px] text-dim uppercase tracking-widest leading-tight mt-0.5">{STAGE_LABELS[stage]}</div>
          </button>
        ))}
      </div>

      {/* Parse Email modal */}
      {showEmailParse && (
        <form onSubmit={parseEmail} className="border border-blue/40 p-4 space-y-3 bg-panel/50">
          <div>
            <div className="text-xs text-blue uppercase tracking-widest mb-1">Paste Email from Furnished Finder or Facebook</div>
            <div className="text-[10px] text-dim">Paste the full email — we'll extract the name, phone, source, budget, and move-in date automatically.</div>
          </div>
          <textarea
            required
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            placeholder="Paste full email here..."
            rows={8}
            className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none resize-y font-mono"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={parsing || !emailText.trim()} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">
              {parsing ? 'Parsing...' : 'Extract & Fill Form'}
            </button>
            <button type="button" onClick={() => { setShowEmailParse(false); setEmailText('') }} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addLead} className="border border-edge p-4 space-y-3">
          <div className="text-xs text-dim uppercase tracking-widest mb-2">New Lead</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="furnished_finder">Furnished Finder</option>
              <option value="facebook">Facebook</option>
              <option value="referral">Referral</option>
              <option value="direct">Direct</option>
              <option value="openphone">OpenPhone</option>
            </select>
            <input value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="Budget ($/mo)" type="number" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.move_in_date} onChange={e => setForm(f => ({ ...f, move_in_date: e.target.value }))} placeholder="Move-in date" type="date" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.interested_room_id} onChange={e => setForm(f => ({ ...f, interested_room_id: e.target.value }))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none sm:col-span-2">
              <option value="">No specific room</option>
              {properties.map(prop => (
                <optgroup key={prop.id} label={prop.address}>
                  {rooms.filter(r => r.property_id === prop.id).map(r => (
                    <option key={r.id} value={r.id}>{r.label ?? 'Room'} — {r.status}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={2} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">Cancel</button>
          </div>
        </form>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or phone..."
        className="w-full bg-panel border border-edge px-3 py-2 text-xs text-content focus:border-blue outline-none"
      />

      {/* Stage filter tabs */}
      <div className="flex gap-0 border border-edge overflow-x-auto">
        <button
          onClick={() => setActiveStage('all')}
          className={`px-3 py-1.5 text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors ${activeStage === 'all' ? 'bg-blue text-white' : 'text-dim hover:text-content'}`}
        >
          All ({leads.length})
        </button>
        {STAGES.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors ${activeStage === stage ? 'bg-blue text-white' : 'text-dim hover:text-content'}`}
          >
            {STAGE_LABELS[stage]} {countByStage(stage) > 0 && `(${countByStage(stage)})`}
          </button>
        ))}
        {noStage > 0 && (
          <button
            onClick={() => setActiveStage('all')}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest whitespace-nowrap text-dim"
          >
            No Stage ({noStage})
          </button>
        )}
      </div>

      {/* Lead list */}
      <div className="space-y-px">
        {filtered.length === 0 ? (
          <div className="text-xs text-dim py-4">No leads found</div>
        ) : (
          filtered.map(lead => {
            const room = roomLabel(lead.interested_room_id)
            const isExpanded = expandedId === lead.id
            return (
              <div key={lead.id} className="border border-edge hover:bg-panel/30 transition-colors">
                <button
                  className="w-full text-left p-3"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-content font-medium truncate">{lead.name}</span>
                      {lead.source && (
                        <span className="text-[9px] text-dim border border-edge px-1.5 py-0.5 uppercase tracking-widest shrink-0">
                          {SOURCE_LABELS[lead.source] ?? lead.source}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] uppercase tracking-widest shrink-0 ${lead.lead_stage ? STAGE_COLORS[lead.lead_stage] : 'text-fade'}`}>
                      {lead.lead_stage ? STAGE_LABELS[lead.lead_stage] : 'No stage'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {lead.phone && <span className="text-[10px] text-dim">{lead.phone}</span>}
                    {lead.budget && <span className="text-[10px] text-content">${lead.budget.toLocaleString()}/mo</span>}
                    {lead.move_in_date && (
                      <span className="text-[10px] text-dim">
                        Move-in: {new Date(lead.move_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {lead.last_contact && (
                      <span className="text-[10px] text-dim">
                        Last contact: {new Date(lead.last_contact).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {room && <span className="text-[10px] text-blue truncate max-w-[200px]">{room}</span>}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-edge px-3 pb-3 pt-2 space-y-3">
                    {lead.notes && (
                      <div className="text-[10px] text-dim whitespace-pre-wrap">{lead.notes}</div>
                    )}

                    {/* Stage picker */}
                    <div>
                      <div className="text-[9px] text-fade uppercase tracking-widest mb-1.5">Move to stage</div>
                      <div className="flex flex-wrap gap-1">
                        {STAGES.map(stage => (
                          <button
                            key={stage}
                            onClick={() => updateStage(lead.id, stage)}
                            className={`text-[9px] px-2 py-1 border uppercase tracking-widest transition-colors ${
                              lead.lead_stage === stage
                                ? 'border-blue text-blue'
                                : 'border-edge text-dim hover:border-blue/50 hover:text-content'
                            }`}
                          >
                            {STAGE_LABELS[stage]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => logNote(lead)}
                        className="text-[10px] text-dim border border-edge px-2.5 py-1 hover:text-content hover:border-blue/50 transition-colors uppercase tracking-widest"
                      >
                        Log Note
                      </button>
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-[10px] text-dim border border-edge px-2.5 py-1 hover:text-content hover:border-blue/50 transition-colors uppercase tracking-widest"
                        >
                          Call
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
