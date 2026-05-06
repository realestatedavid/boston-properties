'use client'

import type { FollowUp } from '@/lib/types'
import { createClient } from '@/lib/supabase'

interface Props {
  followUp: FollowUp
  onDone: (id: string) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-urgent',
  high: 'bg-warn',
  normal: 'bg-fade',
}

export default function FollowUpItem({ followUp, onDone }: Props) {
  const supabase = createClient()

  async function markDone() {
    await supabase.from('follow_ups').update({ is_done: true }).eq('id', followUp.id)
    onDone(followUp.id)
  }

  const isOverdue = followUp.due_date && new Date(followUp.due_date) < new Date() && !followUp.is_done

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-edge last:border-0 ${followUp.is_done ? 'opacity-40' : ''}`}>
      <button
        onClick={markDone}
        disabled={followUp.is_done}
        className="mt-0.5 w-4 h-4 border border-fade shrink-0 hover:border-good transition-colors flex items-center justify-center"
      >
        {followUp.is_done && <span className="text-good text-[10px]">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[followUp.priority]}`} />
          <span className="text-xs text-content">{followUp.task}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-dim">
          {followUp.contacts?.name && <span>{followUp.contacts.name}</span>}
          {followUp.due_date && (
            <span className={isOverdue ? 'text-urgent' : ''}>
              {new Date(followUp.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {followUp.profiles?.full_name && (
            <span className="text-fade">→ {followUp.profiles.full_name}</span>
          )}
        </div>
      </div>
    </div>
  )
}
