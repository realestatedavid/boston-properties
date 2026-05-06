'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/components/RoleProvider'
import type { KPI } from '@/lib/types'

function fmt(value: number, format: KPI['format']): string {
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  if (format === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}

export default function KPIsPage() {
  const { role } = useRole()
  const router = useRouter()
  const supabase = createClient()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    if (role !== 'admin') router.replace('/follow-ups')
  }, [role, router])

  const load = useCallback(async () => {
    const { data } = await supabase.from('kpis').select('*').order('category')
    if (data) setKpis(data as KPI[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function saveEdit(kpi: KPI) {
    const val = parseFloat(editValue)
    if (isNaN(val)) { setEditing(null); return }
    await supabase.from('kpis').update({ value: val, updated_at: new Date().toISOString() }).eq('id', kpi.id)
    setKpis(prev => prev.map(k => k.id === kpi.id ? { ...k, value: val } : k))
    setEditing(null)
  }

  const categories = [...new Set(kpis.map(k => k.category))].filter(Boolean)

  if (role !== 'admin') return null
  if (loading) return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-medium text-content">KPIs</h1>
        <div className="text-xs text-dim mt-1 uppercase tracking-widest">Click any card to update value</div>
      </div>

      {categories.map(cat => (
        <div key={cat}>
          <div className="text-[10px] text-dim uppercase tracking-widest mb-3">{cat}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-edge">
            {kpis.filter(k => k.category === cat).map(kpi => {
              const pct = kpi.target > 0 ? Math.min((kpi.value / kpi.target) * 100, 100) : 0
              const isGood = pct >= 80
              const isMid = pct >= 50
              const isEditingThis = editing === kpi.id

              return (
                <div
                  key={kpi.id}
                  className="bg-panel p-4 cursor-pointer hover:bg-panel/80 transition-colors"
                  onClick={() => {
                    if (!isEditingThis) {
                      setEditing(kpi.id)
                      setEditValue(String(kpi.value))
                    }
                  }}
                >
                  <div className="text-[10px] text-dim uppercase tracking-widest mb-3">{kpi.label}</div>

                  {isEditingThis ? (
                    <div className="mb-3" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(kpi)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="w-full bg-dark border border-blue px-2 py-1 text-lg text-content outline-none"
                      />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => saveEdit(kpi)} className="text-[10px] text-blue hover:text-content uppercase tracking-widest">Save</button>
                        <button onClick={() => setEditing(null)} className="text-[10px] text-dim hover:text-content uppercase tracking-widest">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-2xl font-medium text-content mb-1">{fmt(kpi.value, kpi.format)}</div>
                  )}

                  <div className="text-xs text-dim mb-3">of {fmt(kpi.target, kpi.format)}</div>
                  <div className="h-px bg-edge w-full mb-1">
                    <div
                      className={`h-px ${isGood ? 'bg-good' : isMid ? 'bg-warn' : 'bg-urgent'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`text-[10px] uppercase tracking-widest ${isGood ? 'text-good' : isMid ? 'text-warn' : 'text-urgent'}`}>
                    {pct.toFixed(0)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
