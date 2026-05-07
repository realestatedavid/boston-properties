export type Role = 'admin' | 'employee'

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
}

export interface Property {
  id: string
  address: string
  neighborhood: string | null
  type: 'rooms' | 'mix' | 'single' | 'multi-family' | null
  created_at: string
}

export interface Room {
  id: string
  property_id: string
  label: string | null
  notes: string | null
  status: 'occupied' | 'vacant'
  tenant_name: string | null
  rent: number | null
  lease_start: string | null
  lease_end: string | null
  renewal_status: 'unknown' | 'not_extending' | 'possibly_extending' | 'confirmed' | 'renewed'
  created_at: string
}

export interface Contact {
  id: string
  name: string
  phone: string | null
  email: string | null
  type: 'tenant' | 'ff_lead' | 'buyer' | 'seller' | 'investor' | 'past_client' | null
  status: 'active' | 'past' | 'nurture' | 'placed'
  source: 'openphone' | 'facebook' | 'furnished_finder' | 'referral' | 'direct' | null
  assigned_to: string | null
  notes: string | null
  last_contact: string | null
  created_at: string
}

export interface Transaction {
  id: string
  address: string
  type: 'buy-side' | 'listing' | 'dual' | null
  stage: 'pre-market' | 'touring' | 'offer' | 'under-contract' | 'closed' | null
  price: number | null
  client_id: string | null
  close_date: string | null
  priority: 'high' | 'medium' | 'low'
  notes: string | null
  created_at: string
  contacts?: { name: string } | null
}

export interface FollowUp {
  id: string
  contact_id: string | null
  task: string
  due_date: string | null
  priority: 'urgent' | 'high' | 'normal'
  assigned_to: string | null
  is_done: boolean
  created_at: string
  contacts?: { name: string } | null
  profiles?: { full_name: string | null } | null
}

export interface MaintenanceTicket {
  id: string
  room_id: string | null
  tenant_name: string | null
  issue: string
  priority: 'urgent' | 'high' | 'normal'
  status: 'open' | 'in_progress' | 'resolved'
  assigned_to: string | null
  resolved_at: string | null
  notes: string | null
  created_at: string
  rooms_v2?: { label: string | null; property_id: string } | null
}

export interface Alert {
  id: string
  type: string
  severity: 'urgent' | 'high' | 'normal'
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  assigned_to: 'david' | 'sarah' | 'both' | null
  is_resolved: boolean
  resolved_at: string | null
  created_at: string
}

export interface KPI {
  id: string
  label: string
  value: number
  target: number
  format: 'currency' | 'number' | 'percent'
  category: 'sales' | 'portfolio' | 'content' | 'operations' | null
  updated_at: string
}

export interface Message {
  id: string
  contact_id: string | null
  direction: 'inbound' | 'outbound'
  body: string
  channel: 'openphone' | 'facebook' | 'instagram' | 'furnished_finder' | 'email'
  sent_by: string | null
  is_read: boolean
  external_id: string | null
  created_at: string
  contacts?: { name: string; phone: string | null; type: string | null; fb_id: string | null } | null
}
