'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Contact, Property, Room } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChargeStatus = 'upcoming' | 'due' | 'partially_paid' | 'paid' | 'late' | 'waived' | 'bad_debt'
type PaymentMethod = 'stripe' | 'zelle' | 'venmo' | 'cash' | 'check' | 'other'

interface RentCharge {
  id: string
  tenant_id: string | null
  property_id: string | null
  room_id: string | null
  owner_id: string | null
  rent_month: string
  due_date: string
  base_rent: number
  late_fee: number
  other_charges: number
  total_paid: number
  stripe_payment_link: string | null
  status: ChargeStatus
  notes: string | null
  created_at: string
  contacts?: { name: string; phone: string | null } | null
  properties_v2?: { address: string } | null
  rooms_v2?: { label: string | null } | null
}

interface Payment {
  id: string
  tenant_id: string | null
  rent_charge_id: string | null
  payment_date: string
  payment_method: PaymentMethod
  amount: number
  fee: number
  memo: string | null
  match_confidence: string | null
  status: string
  notes: string | null
  created_at: string
  contacts?: { name: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ChargeStatus, string> = {
  upcoming: 'Upcoming', due: 'Due', partially_paid: 'Partial',
  paid: 'Paid', late: 'Late', waived: 'Waived', bad_debt: 'Bad Debt',
}

const STATUS_COLOR: Record<ChargeStatus, string> = {
  upcoming: 'text-fade', due: 'text-warn', partially_paid: 'text-warn',
  paid: 'text-good', late: 'text-urgent', waived: 'text-dim', bad_debt: 'text-urgent',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: 'Stripe', zelle: 'Zelle', venmo: 'Venmo',
  cash: 'Cash', check: 'Check', other: 'Other',
}

function totalDue(c: RentCharge) {
  return (c.base_rent ?? 0) + (c.late_fee ?? 0) + (c.other_charges ?? 0)
}

function balance(c: RentCharge) {
  return totalDue(c) - (c.total_paid ?? 0)
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function monthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const supabase = createClient()

  const [charges, setCharges] = useState<RentCharge[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [tenants, setTenants] = useState<Contact[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Add charge form
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [chargeForm, setChargeForm] = useState({
    tenant_id: '', property_id: '', room_id: '',
    rent_month: currentMonth(), due_date: '', base_rent: '', late_fee: '0', other_charges: '0',
  })

  // Log payment form (per charge)
  const [payingFor, setPayingFor] = useState<string | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'zelle' as PaymentMethod,
    amount: '', memo: '', notes: '',
  })

  const load = useCallback(async () => {
    const monthStart = selectedMonth
    const monthEnd = new Date(new Date(selectedMonth).setMonth(new Date(selectedMonth).getMonth() + 1))
      .toISOString().split('T')[0]

    const [chargesRes, paymentsRes, tenantsRes, propsRes, roomsRes] = await Promise.all([
      supabase
        .from('rent_charges')
        .select('*, contacts(name, phone), properties_v2(address), rooms_v2(label)')
        .gte('rent_month', monthStart)
        .lt('rent_month', monthEnd)
        .order('status')
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('*, contacts(name)')
        .gte('payment_date', monthStart)
        .lt('payment_date', monthEnd)
        .order('payment_date', { ascending: false }),
      supabase.from('contacts').select('id, name, phone').eq('type', 'tenant').eq('status', 'active').order('name'),
      supabase.from('properties_v2').select('*').order('address'),
      supabase.from('rooms_v2').select('*').order('label'),
    ])

    if (chargesRes.data) setCharges(chargesRes.data as RentCharge[])
    if (paymentsRes.data) setPayments(paymentsRes.data as Payment[])
    if (tenantsRes.data) setTenants(tenantsRes.data as Contact[])
    if (propsRes.data) setProperties(propsRes.data as Property[])
    if (roomsRes.data) setRooms(roomsRes.data as Room[])
    setLoading(false)
  }, [supabase, selectedMonth])

  useEffect(() => { load() }, [load])

  // ── Add rent charge ────────────────────────────────────────────────────────

  async function addCharge(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const tenant = tenants.find(t => t.id === chargeForm.tenant_id)
    await supabase.from('rent_charges').insert([{
      tenant_id: chargeForm.tenant_id || null,
      property_id: chargeForm.property_id || null,
      room_id: chargeForm.room_id || null,
      rent_month: chargeForm.rent_month,
      due_date: chargeForm.due_date || chargeForm.rent_month,
      base_rent: parseFloat(chargeForm.base_rent) || 0,
      late_fee: parseFloat(chargeForm.late_fee) || 0,
      other_charges: parseFloat(chargeForm.other_charges) || 0,
      total_paid: 0,
      status: 'due',
    }])
    setShowAddCharge(false)
    setChargeForm({ tenant_id: '', property_id: '', room_id: '', rent_month: currentMonth(), due_date: '', base_rent: '', late_fee: '0', other_charges: '0' })
    setSaving(false)
    load()
  }

  // ── Log payment ───────────────────────────────────────────────────────────

  async function logPayment(charge: RentCharge) {
    setSaving(true)
    const amount = parseFloat(paymentForm.amount)
    if (!amount || amount <= 0) { setSaving(false); return }

    await supabase.from('payments').insert([{
      tenant_id: charge.tenant_id,
      rent_charge_id: charge.id,
      property_id: charge.property_id,
      room_id: charge.room_id,
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      amount,
      fee: 0,
      memo: paymentForm.memo || null,
      notes: paymentForm.notes || null,
      status: 'posted',
    }])

    const newTotalPaid = (charge.total_paid ?? 0) + amount
    const newTotal = totalDue(charge)
    const newStatus: ChargeStatus = newTotalPaid >= newTotal ? 'paid' : 'partially_paid'

    await supabase.from('rent_charges')
      .update({ total_paid: newTotalPaid, status: newStatus })
      .eq('id', charge.id)

    setPayingFor(null)
    setPaymentForm({ payment_date: new Date().toISOString().split('T')[0], payment_method: 'zelle', amount: '', memo: '', notes: '' })
    setSaving(false)
    load()
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalDueAll = charges.reduce((s, c) => s + totalDue(c), 0)
  const totalCollected = charges.reduce((s, c) => s + (c.total_paid ?? 0), 0)
  const totalOutstanding = charges.reduce((s, c) => s + Math.max(0, balance(c)), 0)
  const unpaidCount = charges.filter(c => c.status !== 'paid' && c.status !== 'waived').length
  const needsReview = payments.filter(p => p.status === 'needs_review').length

  if (loading) return <div className="p-8 text-sm text-dim animate-pulse">Loading…</div>

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Ledger</h1>
          <p className="text-sm text-dim mt-1">{monthLabel(selectedMonth)}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedMonth.slice(0, 7)}
            onChange={e => setSelectedMonth(`${e.target.value}-01`)}
            className="border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md"
          />
          <button
            onClick={() => setShowAddCharge(!showAddCharge)}
            className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90"
          >
            + Charge
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex gap-10 border-b border-edge pb-6">
        <div>
          <div className="text-2xl font-semibold text-content">${totalDueAll.toLocaleString()}</div>
          <div className="text-xs text-dim mt-0.5">Total charged</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-good">${totalCollected.toLocaleString()}</div>
          <div className="text-xs text-dim mt-0.5">Collected</div>
        </div>
        <div>
          <div className={`text-2xl font-semibold ${totalOutstanding > 0 ? 'text-urgent' : 'text-good'}`}>
            ${totalOutstanding.toLocaleString()}
          </div>
          <div className="text-xs text-dim mt-0.5">Outstanding</div>
        </div>
        <div>
          <div className={`text-2xl font-semibold ${unpaidCount > 0 ? 'text-warn' : 'text-good'}`}>
            {unpaidCount}
          </div>
          <div className="text-xs text-dim mt-0.5">Unpaid</div>
        </div>
        {needsReview > 0 && (
          <div>
            <div className="text-2xl font-semibold text-warn">{needsReview}</div>
            <div className="text-xs text-dim mt-0.5">Needs review</div>
          </div>
        )}
      </div>

      {/* Add charge form */}
      {showAddCharge && (
        <form onSubmit={addCharge} className="border border-edge rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-medium text-content">New Rent Charge</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-dim block mb-1">Tenant</label>
              <select
                required
                value={chargeForm.tenant_id}
                onChange={e => setChargeForm(f => ({ ...f, tenant_id: e.target.value }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              >
                <option value="">Select tenant</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Property</label>
              <select
                value={chargeForm.property_id}
                onChange={e => setChargeForm(f => ({ ...f, property_id: e.target.value, room_id: '' }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              >
                <option value="">Select property</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Room</label>
              <select
                value={chargeForm.room_id}
                onChange={e => setChargeForm(f => ({ ...f, room_id: e.target.value }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              >
                <option value="">Select room</option>
                {rooms
                  .filter(r => !chargeForm.property_id || r.property_id === chargeForm.property_id)
                  .map(r => <option key={r.id} value={r.id}>{r.label ?? 'Room'}</option>)
                }
              </select>
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Rent month</label>
              <input
                type="month"
                value={chargeForm.rent_month.slice(0, 7)}
                onChange={e => setChargeForm(f => ({ ...f, rent_month: `${e.target.value}-01` }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Due date</label>
              <input
                type="date"
                value={chargeForm.due_date}
                onChange={e => setChargeForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Base rent ($)</label>
              <input
                required
                type="number"
                value={chargeForm.base_rent}
                onChange={e => setChargeForm(f => ({ ...f, base_rent: e.target.value }))}
                placeholder="1800"
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Late fee ($)</label>
              <input
                type="number"
                value={chargeForm.late_fee}
                onChange={e => setChargeForm(f => ({ ...f, late_fee: e.target.value }))}
                className="w-full border border-edge px-3 py-2 text-sm focus:outline-none focus:border-blue rounded-md"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save charge'}
            </button>
            <button type="button" onClick={() => setShowAddCharge(false)} className="text-sm text-dim hover:text-content">Cancel</button>
          </div>
        </form>
      )}

      {/* Charges list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-content">Rent Charges</h2>
          <span className="text-xs text-dim">{charges.length} charges</span>
        </div>

        {charges.length === 0 ? (
          <div className="border border-edge rounded-lg p-6 text-center">
            <p className="text-sm text-dim">No charges for {monthLabel(selectedMonth)}.</p>
            <button onClick={() => setShowAddCharge(true)} className="text-sm text-blue hover:underline mt-2">
              Add the first charge
            </button>
          </div>
        ) : (
          <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
            {charges.map(charge => {
              const due = totalDue(charge)
              const bal = balance(charge)
              const isExpanded = expandedId === charge.id
              const isPaying = payingFor === charge.id
              const chargePayments = payments.filter(p => p.rent_charge_id === charge.id)

              return (
                <div key={charge.id}>
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-panel transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : charge.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-content">
                          {charge.contacts?.name ?? 'Unknown tenant'}
                        </div>
                        <div className="text-xs text-dim mt-0.5 flex gap-2">
                          {charge.properties_v2?.address && <span>{charge.properties_v2.address}</span>}
                          {charge.rooms_v2?.label && <span>· {charge.rooms_v2.label}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-sm font-semibold text-content">${due.toLocaleString()}</div>
                            {bal > 0 && bal < due && (
                              <div className="text-xs text-warn">${bal.toLocaleString()} left</div>
                            )}
                          </div>
                          <span className={`text-xs font-medium ${STATUS_COLOR[charge.status]}`}>
                            {STATUS_LABEL[charge.status]}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-edge bg-panel space-y-4">
                      {/* Breakdown */}
                      <div className="grid grid-cols-4 gap-4 text-xs">
                        <div>
                          <div className="text-dim mb-0.5">Base rent</div>
                          <div className="font-medium text-content">${charge.base_rent.toLocaleString()}</div>
                        </div>
                        {charge.late_fee > 0 && (
                          <div>
                            <div className="text-dim mb-0.5">Late fee</div>
                            <div className="font-medium text-urgent">${charge.late_fee.toLocaleString()}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-dim mb-0.5">Paid</div>
                          <div className="font-medium text-good">${charge.total_paid.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-dim mb-0.5">Balance</div>
                          <div className={`font-medium ${bal > 0 ? 'text-urgent' : 'text-good'}`}>
                            ${Math.abs(bal).toLocaleString()}{bal < 0 ? ' credit' : ''}
                          </div>
                        </div>
                      </div>

                      {/* Payment history */}
                      {chargePayments.length > 0 && (
                        <div>
                          <div className="text-xs text-dim mb-1.5">Payments</div>
                          <div className="space-y-1">
                            {chargePayments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-content">${p.amount.toLocaleString()}</span>
                                  <span className="text-dim">{METHOD_LABEL[p.payment_method as PaymentMethod]}</span>
                                  {p.memo && <span className="text-fade">· {p.memo}</span>}
                                </div>
                                <span className="text-dim">
                                  {new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {!isPaying && charge.status !== 'paid' && charge.status !== 'waived' && (
                        <button
                          onClick={() => {
                            setPayingFor(charge.id)
                            setPaymentForm(f => ({ ...f, amount: String(Math.max(0, bal)) }))
                          }}
                          className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90"
                        >
                          Log payment
                        </button>
                      )}

                      {/* Log payment form */}
                      {isPaying && (
                        <div className="space-y-3 border-t border-edge pt-3">
                          <div className="text-xs font-medium text-content">Log payment</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-dim block mb-1">Amount ($)</label>
                              <input
                                type="number"
                                value={paymentForm.amount}
                                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-dim block mb-1">Method</label>
                              <select
                                value={paymentForm.payment_method}
                                onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                                className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md"
                              >
                                <option value="zelle">Zelle</option>
                                <option value="venmo">Venmo</option>
                                <option value="stripe">Stripe</option>
                                <option value="cash">Cash</option>
                                <option value="check">Check</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-dim block mb-1">Date</label>
                              <input
                                type="date"
                                value={paymentForm.payment_date}
                                onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                                className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-dim block mb-1">Memo</label>
                              <input
                                value={paymentForm.memo}
                                onChange={e => setPaymentForm(f => ({ ...f, memo: e.target.value }))}
                                placeholder="e.g. 28 Clair - Room B - John"
                                className="w-full border border-edge px-3 py-1.5 text-sm focus:outline-none focus:border-blue rounded-md"
                              />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              disabled={saving || !paymentForm.amount}
                              onClick={() => logPayment(charge)}
                              className="text-sm bg-blue text-white px-4 py-1.5 rounded-md hover:bg-blue/90 disabled:opacity-50"
                            >
                              {saving ? 'Saving…' : 'Save payment'}
                            </button>
                            <button onClick={() => setPayingFor(null)} className="text-sm text-dim hover:text-content">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* All payments this month */}
      {payments.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-content mb-3">Payments Received</h2>
          <div className="divide-y divide-edge border border-edge rounded-lg overflow-hidden">
            {payments.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-content">{p.contacts?.name ?? 'Unknown'}</div>
                  <div className="text-xs text-dim mt-0.5 flex gap-2">
                    <span>{METHOD_LABEL[p.payment_method as PaymentMethod]}</span>
                    {p.memo && <span>· {p.memo}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-good">${p.amount.toLocaleString()}</div>
                  <div className="text-xs text-dim">
                    {new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
