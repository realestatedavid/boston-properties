'use client'

import { useState } from 'react'
import type { Property, Room } from '@/lib/types'
import RoomCard from './RoomCard'

interface Props {
  property: Property
  rooms: Room[]
  onRoomUpdate?: (room: Room) => void
}

export default function PropertyGroup({ property, rooms, onRoomUpdate }: Props) {
  const [expanded, setExpanded] = useState(true)
  const occupied = rooms.filter(r => r.status === 'occupied').length
  const vacant = rooms.filter(r => r.status === 'vacant').length

  return (
    <div className="border border-edge">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-panel/50 transition-colors text-left"
      >
        <div>
          <div className="text-sm text-content font-medium">{property.address}</div>
          <div className="text-[10px] text-dim mt-0.5 uppercase tracking-widest">
            {property.neighborhood && <span className="mr-3">{property.neighborhood}</span>}
            {property.type && <span>{property.type}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-content">{rooms.length} rooms</div>
            <div className="text-[10px]">
              <span className="text-good">{occupied} occ</span>
              {vacant > 0 && <span className="text-urgent ml-2">{vacant} vac</span>}
            </div>
          </div>
          <span className="text-dim text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-edge grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-edge">
          {rooms.map(room => (
            <div key={room.id} className="bg-dark p-3">
              <RoomCard room={room} onUpdate={onRoomUpdate} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
