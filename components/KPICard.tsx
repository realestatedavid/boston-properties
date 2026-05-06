'use client'

import type { KPI } from '@/lib/types'

interface Props {
  kpi: KPI
  onClick?: () => void
}

function fmt(value: number, format: KPI['format']): string {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }
  if (format === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}

export default function KPICard({ kpi, onClick }: Props) {
  const pct = kpi.target > 0 ? Math.min((kpi.value / kpi.target) * 100, 100) : 0
  const isGood = pct >= 80
  const isMid = pct >= 50

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-panel border border-edge p-4 hover:border-fade transition-colors"
    >
      <div className="text-[10px] text-dim uppercase tracking-widest mb-3">{kpi.label}</div>
      <div className="text-2xl font-medium text-content mb-1">{fmt(kpi.value, kpi.format)}</div>
      <div className="text-xs text-dim mb-3">of {fmt(kpi.target, kpi.format)}</div>
      <div className="h-px bg-edge w-full mb-1">
        <div
          className={`h-px transition-all ${isGood ? 'bg-good' : isMid ? 'bg-warn' : 'bg-urgent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`text-[10px] uppercase tracking-widest ${isGood ? 'text-good' : isMid ? 'text-warn' : 'text-urgent'}`}>
        {pct.toFixed(0)}% to goal
      </div>
    </button>
  )
}
