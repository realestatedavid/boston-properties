'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import PropertyGroup from '@/components/PropertyGroup'
import type { Property, Room } from '@/lib/types'

export default function PropertiesPage() {
  const supabase = createClient()
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [propsRes, roomsRes] = await Promise.all([
      supabase.from('properties_v2').select('*').order('address'),
      supabase.from('rooms_v2').select('*').order('label'),
    ])
    if (propsRes.data) setProperties(propsRes.data as Property[])
    if (roomsRes.data) setRooms(roomsRes.data as Room[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function updateRoom(updated: Room) {
    setRooms(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  const occupied = rooms.filter(r => r.status === 'occupied').length
  const vacant = rooms.filter(r => r.status === 'vacant').length

  if (loading) {
    return <div className="p-6 text-xs text-dim uppercase tracking-widest animate-pulse">Loading...</div>
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium text-content">Properties</h1>
          <div className="text-xs text-dim mt-1 uppercase tracking-widest">
            {properties.length} properties · {rooms.length} rooms ·{' '}
            <span className="text-good">{occupied} occupied</span> ·{' '}
            <span className="text-urgent">{vacant} vacant</span>
          </div>
        </div>
      </div>

      <div className="space-y-px">
        {properties.map(prop => (
          <PropertyGroup
            key={prop.id}
            property={prop}
            rooms={rooms.filter(r => r.property_id === prop.id)}
            onRoomUpdate={updateRoom}
          />
        ))}
      </div>
    </div>
  )
}
