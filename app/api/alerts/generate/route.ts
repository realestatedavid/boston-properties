import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  // Clear existing auto-generated unresolved alerts
  await supabase.from('alerts').delete().eq('is_resolved', false).in('type', ['lease_expiry', 'vacancy', 'missing_lease'])

  const alerts: Array<{
    type: string
    severity: 'urgent' | 'high' | 'normal'
    title: string
    body: string
    entity_type: string
    entity_id: string
    assigned_to: 'david' | 'sarah' | 'both'
  }> = []

  const today = new Date()
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in60 = new Date(today); in60.setDate(today.getDate() + 60)

  // Leases expiring soon
  const { data: rooms } = await supabase.from('rooms_v2').select('*').eq('status', 'occupied')

  if (rooms) {
    for (const room of rooms) {
      if (!room.lease_end) {
        alerts.push({
          type: 'missing_lease',
          severity: 'normal',
          title: `Missing lease date: ${room.label || room.id}`,
          body: `${room.tenant_name || 'Tenant'} has no lease end date recorded`,
          entity_type: 'room',
          entity_id: room.id,
          assigned_to: 'david',
        })
        continue
      }

      const leaseEnd = new Date(room.lease_end)
      if (leaseEnd <= in30) {
        alerts.push({
          type: 'lease_expiry',
          severity: 'urgent',
          title: `Lease expiring soon: ${room.tenant_name || room.label}`,
          body: `${room.label} — expires ${new Date(room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          entity_type: 'room',
          entity_id: room.id,
          assigned_to: 'both',
        })
      } else if (leaseEnd <= in60) {
        alerts.push({
          type: 'lease_expiry',
          severity: 'high',
          title: `Lease expiring in 30-60 days: ${room.tenant_name || room.label}`,
          body: `${room.label} — expires ${new Date(room.lease_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          entity_type: 'room',
          entity_id: room.id,
          assigned_to: 'both',
        })
      }
    }

    // Vacant rooms
    const { data: vacantRooms } = await supabase.from('rooms_v2').select('*').eq('status', 'vacant')
    if (vacantRooms) {
      for (const room of vacantRooms) {
        alerts.push({
          type: 'vacancy',
          severity: 'high',
          title: `Vacant room: ${room.label || room.id}`,
          body: `Room is currently vacant and generating no income`,
          entity_type: 'room',
          entity_id: room.id,
          assigned_to: 'both',
        })
      }
    }
  }

  if (alerts.length > 0) {
    await supabase.from('alerts').insert(alerts)
  }

  return NextResponse.json({ generated: alerts.length })
}
