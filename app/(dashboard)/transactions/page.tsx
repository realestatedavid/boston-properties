'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/components/RoleProvider'
import type { Transaction } from '@/lib/types'

const STAGES = ['pre-market', 'touring', 'offer', 'under-contract', 'closed'] as const

const STAGE_LABELS: Record<string, string> = {
  'pre-market': 'Pre-Market',
  'touring': 'Touring',
  'offer': 'Offer',
  'under-contract': 'Under Contract',
  'closed': 'Closed',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-urgent',
  medium: 'text-warn',
  low: 'text-dim',
}

const TYPE_COLORS: Record<string, string> = {
  'buy-side': 'text-blue',
  'listing': 'text-good',
  'dual': 'text-warn',
}

export default function TransactionsPage() {
  const { role } = useRole()
  const router = useRouter()
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ address: '', type: 'buy-side', stage: 'touring', price: '', priority: 'medium', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (role !== 'admin') router.replace('/follow-ups')
  }, [role, router])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, contacts(name)')
      .order('created_at', { ascending: false })
    if (data) setTransactions(data as Transaction[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase.from('transactions').insert([{
      ...form,
      price: form.price ? parseFloat(form.price) : null,
    }]).select('*, contacts(name)').single()
    if (data) setTransactions(prev => [data as Transaction, ...prev])
    setShowAdd(false)
    setForm({ address: '', type: 'buy-side', stage: 'touring', price: '', priority: 'medium', notes: '' })
    setSaving(false)
  }

  if (role !== 'admin') return null
  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Transactions</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">{transactions.filter(t => t.stage !== 'closed').length} active</div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 uppercase tracking-widest">
          + Add
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addTransaction} className="border border-edge p-4 space-y-3">
          <div className="text-xs text-dim uppercase tracking-widest mb-2">New Transaction</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Address" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <input value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} placeholder="Price" type="number" className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none" />
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="buy-side">Buy Side</option>
              <option value="listing">Listing</option>
              <option value="dual">Dual</option>
            </select>
            <select value={form.stage} onChange={e => setForm(f => ({...f, stage: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Notes" rows={2} className="bg-dark border border-edge px-3 py-2 text-xs text-content w-full focus:border-blue outline-none resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-xs bg-blue text-white px-3 py-1.5 hover:bg-blue/90 disabled:opacity-50 uppercase tracking-widest">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-dim hover:text-content px-3 py-1.5 uppercase tracking-widest">Cancel</button>
          </div>
        </form>
      )}

      {/* Pipeline by stage */}
      <div className="space-y-4">
        {STAGES.filter(s => s !== 'closed').map(stage => {
          const stageTx = transactions.filter(t => t.stage === stage)
          if (stageTx.length === 0) return null
          return (
            <div key={stage}>
              <div className="text-[10px] text-dim uppercase tracking-widest mb-2 flex items-center gap-2">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="text-fade">({stageTx.length})</span>
              </div>
              <div className="space-y-px">
                {stageTx.map(tx => (
                  <div key={tx.id} className="border border-edge p-3 hover:bg-panel/50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm text-content">{tx.address}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {tx.type && <span className={`text-[10px] uppercase tracking-widest ${TYPE_COLORS[tx.type]}`}>{tx.type}</span>}
                        <span className={`text-[10px] uppercase tracking-widest ${PRIORITY_COLORS[tx.priority]}`}>{tx.priority}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-dim">
                      {tx.price && <span>${Number(tx.price).toLocaleString()}</span>}
                      {tx.contacts?.name && <span>{tx.contacts.name}</span>}
                      {tx.close_date && <span>Close: {new Date(tx.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>
                    {tx.notes && <div className="text-[10px] text-dim mt-1 line-clamp-1">{tx.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Closed */}
      {transactions.filter(t => t.stage === 'closed').length > 0 && (
        <details className="border border-edge">
          <summary className="px-4 py-3 text-[10px] text-dim uppercase tracking-widest cursor-pointer hover:text-content">
            Closed ({transactions.filter(t => t.stage === 'closed').length})
          </summary>
          <div className="space-y-px">
            {transactions.filter(t => t.stage === 'closed').map(tx => (
              <div key={tx.id} className="border-t border-edge p-3 opacity-50">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-content">{tx.address}</span>
                  {tx.price && <span className="text-xs text-good">${Number(tx.price).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
