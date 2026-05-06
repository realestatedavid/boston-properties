'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Contact } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  ff_lead: 'FF Lead',
  buyer: 'Buyer',
  seller: 'Seller',
  investor: 'Investor',
  past_client: 'Past Client',
}

const TYPE_COLORS: Record<string, string> = {
  tenant: 'text-blue border-blue/30',
  ff_lead: 'text-warn border-warn/30',
  buyer: 'text-good border-good/30',
  seller: 'text-urgent border-urgent/30',
  investor: 'text-content border-fade',
  past_client: 'text-dim border-edge',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-good',
  past: 'text-dim',
  nurture: 'text-warn',
  placed: 'text-blue',
}

const TABS = ['all', 'tenant', 'ff_lead', 'buyer', 'seller'] as const
type Tab = typeof TABS[number]

export default function ContactsPage() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', type: 'tenant', status: 'active', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
    if (data) setContacts(data as Contact[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function addContact(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase.from('contacts').insert([form]).select().single()
    if (data) setContacts(prev => [data as Contact, ...prev])
    setShowAdd(false)
    setForm({ name: '', phone: '', email: '', type: 'tenant', status: 'active', notes: '' })
    setSaving(false)
  }

  const filtered = contacts.filter(c => {
    if (tab !== 'all' && c.type !== tab) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.type?.includes(q)
    }
    return true
  })

  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Contacts</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">{contacts.length} contacts</div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 transition-colors uppercase tracking-widest"
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addContact} className="border border-edge p-4 space-y-3">
          <div className="text-xs text-dim uppercase tracking-widest mb-2">New Contact</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Name" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="Phone" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="Email" type="email" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="tenant">Tenant</option>
              <option value="ff_lead">FF Lead</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="investor">Investor</option>
              <option value="past_client">Past Client</option>
            </select>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Notes" rows={2} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, phone, type..."
        className="w-full bg-panel border border-edge px-3 py-2 text-xs text-content focus:border-blue outline-none"
      />

      {/* Tabs */}
      <div className="flex gap-0 border border-edge">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] uppercase tracking-widest transition-colors ${
              tab === t ? 'bg-blue text-white' : 'text-dim hover:text-content'
            }`}
          >
            {t === 'ff_lead' ? 'FF Leads' : t}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-px">
        {filtered.length === 0 ? (
          <div className="text-xs text-dim py-4">No contacts found</div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="border border-edge p-3 hover:bg-panel/50">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content font-medium">{c.name}</span>
                  {c.type && (
                    <span className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-widest ${TYPE_COLORS[c.type] || 'text-dim border-edge'}`}>
                      {TYPE_LABELS[c.type] || c.type}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] uppercase tracking-widest shrink-0 ${STATUS_COLORS[c.status]}`}>{c.status}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-dim flex-wrap">
                {c.phone && <span>{c.phone}</span>}
                {c.email && <span>{c.email}</span>}
                {c.last_contact && (
                  <span>Last: {new Date(c.last_contact).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
              {c.notes && <div className="text-[10px] text-dim mt-1.5 line-clamp-1">{c.notes}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
