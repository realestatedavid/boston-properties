'use client'

import { useState } from 'react'
import type { Alert } from '@/lib/types'

interface Props {
  alerts: Alert[]
  onResolve: (id: string) => void
}

export default function AlertBanner({ alerts, onResolve }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id) && !a.is_resolved)
  if (visible.length === 0) return null

  return (
    <div className="space-y-px">
      {visible.map(alert => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 px-4 py-2.5 text-xs ${
            alert.severity === 'urgent'
              ? 'bg-urgent/15 border-l-2 border-urgent'
              : alert.severity === 'high'
              ? 'bg-warn/10 border-l-2 border-warn'
              : 'bg-blue/10 border-l-2 border-blue'
          }`}
        >
          <span className={`mt-0.5 font-medium uppercase tracking-widest text-[10px] shrink-0 ${
            alert.severity === 'urgent' ? 'text-urgent' :
            alert.severity === 'high' ? 'text-warn' : 'text-blue'
          }`}>
            {alert.severity}
          </span>
          <span className="flex-1 text-content">{alert.title}</span>
          {alert.body && <span className="text-dim hidden sm:block">{alert.body}</span>}
          <button
            onClick={() => {
              onResolve(alert.id)
              setDismissed(prev => new Set([...prev, alert.id]))
            }}
            className="text-dim hover:text-content shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
