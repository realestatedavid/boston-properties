'use client'

import { useState } from 'react'
import type { Room } from '@/lib/types'
import { createClient } from '@/lib/supabase'

interface Props {
  room: Room
  onUpdate?: (updated: Room) => void
}

const RENEWAL_OPTIONS: Room['renewal_status'][] = [
  'unknown', 'not_extending', 'possibly_extending', 'confirmed', 'renewed',
]

const RENEWAL_LABELS: Record<Room['renewal_status'], string> = {
  unknown: 'Unknown',
  not_extending: 'Not Extending',
  possibly_extending: 'Maybe',
  confirmed: 'Confirmed',
  renewed: 'Renewed',
}

const RENEWAL_COLORS: Record<Room['renewal_status'], string> = {
  unknown: 'text-dim',
  not_extending: 'text-urgent',
  possibly_extending: 'text-warn',
  confirmed: 'text-blue',
  renewed: 'text-good',
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

function leaseColor(dateStr: string | null): string {
  if (!dateStr) return 'text-dim'
  const days = daysUntil(dateStr)
  if (days < 30) return 'text-urgent'
  if (days < 60) return 'text-warn'
  return 'text-good'
}

export default function RoomCard({ room, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function updateRenewal(status: Room['renewal_status']) {
    setSaving(true)
    setEditing(false)
    const { data } = await supabase
      .from('rooms_v2')
      .update({ renewal_status: status })
      .eq('id', room.id)
      .select()
      .single()
    setSaving(false)
    if (data && onUpdate) onUpdate(data as Room)
  }

  const isVacant = room.status === 'vacant'

  return (
    <div className={`border border-edge p-3 text-xs ${isVacant ? 'border-dashed border-fade' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isVacant ? 'bg-urgent' : 'bg-good'}`} />
          <span className="text-content font-medium">{room.label || room.id}</span>
        </div>
        {room.rent && (
          <span className="text-dim shrink-0">${Number(room.rent).toLocaleString()}/mo</span>
        )}
      </div>

      {isVacant ? (
        <div className="text-dim uppercase tracking-widest text-[10px]">Vacant</div>
      ) : (
        <>
          <div className="text-dim mb-1">{room.tenant_name || '—'}</div>
          <div className="flex items-center gap-3 flex-wrap">
            {room.lease_end && (
              <span className={`${leaseColor(room.lease_end)}`}>
                Lease ends {new Date(room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' '}({daysUntil(room.lease_end)}d)
              </span>
            )}
            <div className="relative">
              <button
                onClick={() => setEditing(!editing)}
                className={`${RENEWAL_COLORS[room.renewal_status]} hover:text-content transition-colors uppercase tracking-widest text-[10px] ${saving ? 'opacity-50' : ''}`}
                disabled={saving}
              >
                {RENEWAL_LABELS[room.renewal_status]}
              </button>
              {editing && (
                <div className="absolute left-0 top-full mt-1 z-10 bg-panel border border-edge min-w-[160px]">
                  {RENEWAL_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => updateRenewal(opt)}
                      className={`w-full text-left px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-edge ${RENEWAL_COLORS[opt]}`}
                    >
                      {RENEWAL_LABELS[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
