'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import AlertBanner from '@/components/AlertBanner'
import KPICard from '@/components/KPICard'
import FollowUpItem from '@/components/FollowUpItem'
import type { Alert, KPI, Room, FollowUp } from '@/lib/types'

export default function OverviewPage() {
  const supabase = createClient()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [kpis, setKpis] = useState<KPI[]>([])
  const [expiringRooms, setExpiringRooms] = useState<Room[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [stats, setStats] = useState({ properties: 0, rooms: 0, occupied: 0, vacant: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = new Date()
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const [alertsRes, kpisRes, roomsRes, followUpsRes, allRoomsRes, propsRes] = await Promise.all([
      supabase.from('alerts').select('*').eq('is_resolved', false).order('created_at', { ascending: false }),
      supabase.from('kpis').select('*').in('label', ['Rooms Occupied', 'Vacancies', 'GCI YTD', 'Transactions Closed']),
      supabase.from('rooms_v2').select('*').eq('status', 'occupied').lte('lease_end', in60.toISOString().split('T')[0]).not('lease_end', 'is', null).order('lease_end', { ascending: true }),
      supabase.from('follow_ups').select('*, contacts(name), profiles(full_name)').eq('is_done', false).lte('due_date', today.toISOString().split('T')[0]).order('due_date', { ascending: true }).limit(15),
      supabase.from('rooms_v2').select('status'),
      supabase.from('properties_v2').select('id'),
    ])

    if (alertsRes.data) setAlerts(alertsRes.data as Alert[])
    if (kpisRes.data) setKpis(kpisRes.data as KPI[])
    if (roomsRes.data) setExpiringRooms(roomsRes.data as Room[])
    if (followUpsRes.data) setFollowUps(followUpsRes.data as FollowUp[])

    if (allRoomsRes.data && propsRes.data) {
      const rooms = allRoomsRes.data
      setStats({
        properties: propsRes.data.length,
        rooms: rooms.length,
        occupied: rooms.filter((r: { status: string }) => r.status === 'occupied').length,
        vacant: rooms.filter((r: { status: string }) => r.status === 'vacant').length,
      })
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function resolveAlert(id: string) {
    await supabase.from('alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: true } : a))
  }

  function removeFollowUp(id: string) {
    setFollowUps(prev => prev.filter(f => f.id !== id))
  }

  function daysUntil(dateStr: string): number {
    const today = new Date(); today.setHours(0,0,0,0)
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <AlertBanner alerts={alerts} onResolve={resolveAlert} />

      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <div className="text-xs text-dim uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="text-xl font-medium text-content">Overview</h1>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-edge">
          {kpis.map(kpi => (
            <KPICard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Expiring leases */}
          <div className="border border-edge">
            <div className="px-4 py-3 border-b border-edge">
              <div className="text-xs text-dim uppercase tracking-widest">Leases Expiring Soon</div>
            </div>
            <div className="p-4">
              {expiringRooms.length === 0 ? (
                <div className="text-xs text-dim">No leases expiring in 60 days</div>
              ) : (
                <div className="space-y-2">
                  {expiringRooms.map(room => {
                    const days = daysUntil(room.lease_end!)
                    return (
                      <div key={room.id} className="flex items-center justify-between text-xs">
                        <div>
                          <div className="text-content">{room.tenant_name || room.label}</div>
                          <div className="text-dim text-[10px]">{room.label}</div>
                        </div>
                        <div className={`text-right shrink-0 ${days < 30 ? 'text-urgent' : 'text-warn'}`}>
                          <div>{new Date(room.lease_end!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                          <div className="text-[10px]">{days}d</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Follow-ups due */}
          <div className="border border-edge">
            <div className="px-4 py-3 border-b border-edge">
              <div className="text-xs text-dim uppercase tracking-widest">Follow-Ups Due</div>
            </div>
            <div className="px-4">
              {followUps.length === 0 ? (
                <div className="text-xs text-dim py-4">No overdue follow-ups</div>
              ) : (
                followUps.map(fu => (
                  <FollowUpItem key={fu.id} followUp={fu} onDone={removeFollowUp} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-px bg-edge">
          {[
            { label: 'Properties', value: stats.properties },
            { label: 'Total Rooms', value: stats.rooms },
            { label: 'Occupied', value: stats.occupied },
            { label: 'Vacant', value: stats.vacant },
          ].map(s => (
            <div key={s.label} className="bg-panel p-4 text-center">
              <div className="text-2xl font-medium text-content">{s.value}</div>
              <div className="text-[10px] text-dim uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
