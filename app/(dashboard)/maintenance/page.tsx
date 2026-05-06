'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { MaintenanceTicket } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'text-urgent',
  in_progress: 'text-warn',
  resolved: 'text-good',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-urgent',
  high: 'bg-warn',
  normal: 'bg-fade',
}

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

export default function MaintenancePage() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ issue: '', tenant_name: '', priority: 'normal', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*, rooms_v2(label, property_id)')
      .order('created_at', { ascending: false })
    if (data) setTickets(data as MaintenanceTicket[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function addTicket(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase.from('maintenance_tickets').insert([form]).select('*, rooms_v2(label, property_id)').single()
    if (data) setTickets(prev => [data as MaintenanceTicket, ...prev])
    setShowAdd(false)
    setForm({ issue: '', tenant_name: '', priority: 'normal', notes: '' })
    setSaving(false)
  }

  async function updateStatus(id: string, status: MaintenanceTicket['status']) {
    const update: Partial<MaintenanceTicket> = { status }
    if (status === 'resolved') update.resolved_at = new Date().toISOString()
    await supabase.from('maintenance_tickets').update(update).eq('id', id)
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...update } : t))
  }

  const STATUS_ORDER: MaintenanceTicket['status'][] = ['open', 'in_progress', 'resolved']
  const groups = STATUS_ORDER.reduce((acc, s) => ({
    ...acc,
    [s]: tickets.filter(t => t.status === s),
  }), {} as Record<string, MaintenanceTicket[]>)

  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Maintenance</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">
            {tickets.filter(t => t.status !== 'resolved').length} open tickets
          </div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 uppercase tracking-widest">
          + Add
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addTicket} className="border border-edge p-4 space-y-3">
          <div className="text-xs text-dim uppercase tracking-widest mb-2">New Ticket</div>
          <input required value={form.issue} onChange={e => setForm(f => ({...f, issue: e.target.value}))} placeholder="Issue description" className="w-full bg-dark border border-edge px-3 py-2 text-xs text-content focus:border-blue outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.tenant_name} onChange={e => setForm(f => ({...f, tenant_name: e.target.value}))} placeholder="Tenant name" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Notes" rows={2} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">Cancel</button>
          </div>
        </form>
      )}

      {STATUS_ORDER.map(status => {
        const group = groups[status]
        if (group.length === 0) return null
        return (
          <div key={status} className="border border-edge">
            <div className={`px-4 py-2 border-b border-edge ${
              status === 'open' ? 'bg-urgent/10' :
              status === 'in_progress' ? 'bg-warn/10' : 'bg-good/5'
            }`}>
              <span className={`text-[10px] uppercase tracking-widest font-medium ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]} ({group.length})
              </span>
            </div>
            <div className="divide-y divide-edge">
              {group.map(ticket => (
                <div key={ticket.id} className="p-3 hover:bg-panel/30">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[ticket.priority]}`} />
                      <span className="text-xs text-content">{ticket.issue}</span>
                    </div>
                    <div className="relative shrink-0">
                      <select
                        value={ticket.status}
                        onChange={e => updateStatus(ticket.id, e.target.value as MaintenanceTicket['status'])}
                        className={`text-[10px] uppercase tracking-widest bg-transparent border border-edge px-2 py-0.5 outline-none cursor-pointer ${STATUS_COLORS[ticket.status]}`}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-dim">
                    {ticket.tenant_name && <span>{ticket.tenant_name}</span>}
                    {ticket.rooms_v2?.label && <span>{ticket.rooms_v2.label}</span>}
                    <span>{daysOpen(ticket.created_at)}d old</span>
                  </div>
                  {ticket.notes && <div className="text-[10px] text-dim mt-1 line-clamp-1">{ticket.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {tickets.length === 0 && (
        <div className="text-xs text-dim py-4">No maintenance tickets. Add one above.</div>
      )}
    </div>
  )
}
