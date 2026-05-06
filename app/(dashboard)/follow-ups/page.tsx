'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/components/RoleProvider'
import type { FollowUp } from '@/lib/types'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-urgent',
  high: 'bg-warn',
  normal: 'bg-fade',
}

export default function FollowUpsPage() {
  const supabase = createClient()
  const { role, userId } = useRole()
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ task: '', due_date: '', priority: 'normal' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    let query = supabase
      .from('follow_ups')
      .select('*, contacts(name), profiles(full_name)')
      .order('due_date', { ascending: true, nullsFirst: false })

    if (role === 'employee') {
      query = query.eq('assigned_to', userId)
    }

    const { data } = await query
    if (data) setFollowUps(data as FollowUp[])
    setLoading(false)
  }, [supabase, role, userId])

  useEffect(() => { load() }, [load])

  async function addFollowUp(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase.from('follow_ups').insert([{
      ...form,
      assigned_to: userId,
      due_date: form.due_date || null,
    }]).select('*, contacts(name), profiles(full_name)').single()
    if (data) setFollowUps(prev => [data as FollowUp, ...prev])
    setShowAdd(false)
    setForm({ task: '', due_date: '', priority: 'normal' })
    setSaving(false)
  }

  async function markDone(id: string) {
    await supabase.from('follow_ups').update({ is_done: true }).eq('id', id)
    setFollowUps(prev => prev.map(f => f.id === id ? { ...f, is_done: true } : f))
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const buckets = {
    overdue: followUps.filter(f => !f.is_done && f.due_date && new Date(f.due_date) < today),
    today: followUps.filter(f => !f.is_done && f.due_date && new Date(f.due_date).toDateString() === today.toDateString()),
    upcoming: followUps.filter(f => !f.is_done && (!f.due_date || new Date(f.due_date) > today && new Date(f.due_date).toDateString() !== today.toDateString())),
    done: followUps.filter(f => f.is_done),
  }

  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Follow-Ups</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">
            {buckets.overdue.length > 0 && <span className="text-urgent mr-2">{buckets.overdue.length} overdue</span>}
            {buckets.today.length > 0 && <span className="text-warn mr-2">{buckets.today.length} today</span>}
            {buckets.upcoming.length} upcoming
          </div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 uppercase tracking-widest">
          + Add
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addFollowUp} className="border border-edge p-4 space-y-3">
          <div className="text-xs text-dim uppercase tracking-widest mb-2">New Follow-Up</div>
          <input required value={form.task} onChange={e => setForm(f => ({...f, task: e.target.value}))} placeholder="Task description" className="w-full bg-dark border border-edge px-3 py-2 text-xs text-content focus:border-blue outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} type="date" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">Cancel</button>
          </div>
        </form>
      )}

      {Object.entries(buckets).map(([bucket, items]) => {
        if (bucket === 'done' && items.length === 0) return null
        if (bucket !== 'done' && items.length === 0) return null

        return (
          <div key={bucket} className="border border-edge">
            <div className={`px-4 py-2 border-b border-edge ${
              bucket === 'overdue' ? 'bg-urgent/10' :
              bucket === 'today' ? 'bg-warn/10' : ''
            }`}>
              <span className={`text-[10px] uppercase tracking-widest font-medium ${
                bucket === 'overdue' ? 'text-urgent' :
                bucket === 'today' ? 'text-warn' :
                bucket === 'done' ? 'text-good' : 'text-dim'
              }`}>
                {bucket} ({items.length})
              </span>
            </div>
            <div className="px-4">
              {items.map(fu => (
                <div
                  key={fu.id}
                  className={`flex items-start gap-3 py-2.5 border-b border-edge last:border-0 ${fu.is_done ? 'opacity-40' : ''}`}
                >
                  <button
                    onClick={() => markDone(fu.id)}
                    disabled={fu.is_done}
                    className="mt-0.5 w-4 h-4 border border-fade shrink-0 hover:border-good flex items-center justify-center"
                  >
                    {fu.is_done && <span className="text-good text-[10px]">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[fu.priority]}`} />
                      <span className="text-xs text-content">{fu.task}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-dim">
                      {fu.contacts?.name && <span>{fu.contacts.name}</span>}
                      {fu.due_date && (
                        <span className={bucket === 'overdue' ? 'text-urgent' : ''}>
                          {new Date(fu.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {fu.profiles?.full_name && <span className="text-fade">→ {fu.profiles.full_name}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {followUps.length === 0 && (
        <div className="text-xs text-dim py-4">No follow-ups yet. Add one above.</div>
      )}
    </div>
  )
}
