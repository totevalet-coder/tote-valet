'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Truck, Package, CalendarDays, MapPin, CheckCircle2, Clock } from 'lucide-react'

interface PickupRequest {
  toteId: string
  toteName: string | null
  customerName: string
  customerAddress: string | null
  customerId: string
}

interface ToteRequest {
  id: string
  type: 'empty_tote_delivery' | 'pickup'
  quantity: number | null
  toteIds: string[]
  preferredDate: string | null
  customerName: string
  customerAddress: string | null
  customerId: string
}

export default function AdminRequestsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [pickupRequests, setPickupRequests] = useState<PickupRequest[]>([])
  const [toteRequests, setToteRequests] = useState<ToteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)

    const [pickupRes, requestsRes] = await Promise.all([
      supabase
        .from('totes')
        .select('id, tote_name, customer_id, customers(name, address)')
        .eq('pickup_requested', true),
      supabase
        .from('tote_requests')
        .select('id, type, quantity, tote_ids, preferred_date, customer_id, customers(name, address)')
        .eq('status', 'pending')
        .order('preferred_date', { ascending: true }),
    ])

    const pReqs: PickupRequest[] = (pickupRes.data ?? []).map((t: {
      id: string; tote_name: string | null; customer_id: string;
      customers: { name: string; address: string | null } | null
    }) => ({
      toteId: t.id,
      toteName: t.tote_name,
      customerName: t.customers?.name ?? 'Unknown',
      customerAddress: t.customers?.address ?? null,
      customerId: t.customer_id,
    }))

    const tReqs: ToteRequest[] = (requestsRes.data ?? []).map((r: {
      id: string; type: string; quantity: number | null; tote_ids: string[];
      preferred_date: string | null; customer_id: string;
      customers: { name: string; address: string | null } | null
    }) => ({
      id: r.id,
      type: r.type as 'empty_tote_delivery' | 'pickup',
      quantity: r.quantity,
      toteIds: r.tote_ids ?? [],
      preferredDate: r.preferred_date,
      customerName: r.customers?.name ?? 'Unknown',
      customerAddress: r.customers?.address ?? null,
      customerId: r.customer_id,
    }))

    setPickupRequests(pReqs)
    setToteRequests(tReqs)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function dismissToteRequest(id: string) {
    setDismissed(prev => new Set([...prev, id]))
    await supabase.from('tote_requests').update({ status: 'acknowledged' }).eq('id', id)
  }

  async function dismissPickupRequest(toteId: string) {
    setDismissed(prev => new Set([...prev, toteId]))
    await supabase.from('totes').update({ pickup_requested: false }).eq('id', toteId)
  }

  const visibleToteReqs = toteRequests.filter(r => !dismissed.has(r.id))
  const visiblePickups = pickupRequests.filter(r => !dismissed.has(r.toteId))
  const total = visibleToteReqs.length + visiblePickups.length

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <div>
        <h1 className="font-black text-2xl text-brand-navy">Customer Requests</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {total > 0 ? `${total} pending request${total !== 1 ? 's' : ''}` : 'No pending requests'}
        </p>
      </div>

      {total === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3" />
          <p className="font-bold text-gray-500 text-lg">All clear!</p>
          <p className="text-gray-400 text-sm mt-1">No pending customer requests.</p>
        </div>
      )}

      {/* Structured tote_requests (new system) */}
      {visibleToteReqs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Scheduled Requests ({visibleToteReqs.length})
          </h2>
          <p className="text-xs text-gray-400 -mt-2">
            Submitted via the customer app with type, quantity, and preferred date.
          </p>
          {visibleToteReqs.map(req => (
            <div key={req.id} className="card space-y-3">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  req.type === 'empty_tote_delivery' ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {req.type === 'empty_tote_delivery'
                    ? <Package className="w-5 h-5 text-purple-600" />
                    : <Truck className="w-5 h-5 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm">{req.customerName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {req.type === 'empty_tote_delivery'
                      ? `Deliver ${req.quantity ?? '?'} empty tote${req.quantity !== 1 ? 's' : ''}`
                      : `Pick up ${req.toteIds.length} tote${req.toteIds.length !== 1 ? 's' : ''}`}
                  </p>
                  {req.preferredDate && (
                    <p className="text-xs text-brand-blue font-semibold mt-1 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {new Date(req.preferredDate + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric'
                      })}
                    </p>
                  )}
                  {req.customerAddress && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{req.customerAddress}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => router.push(`/admin/customers/${req.customerId}`)}
                  className="flex-1 bg-brand-navy text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-900 transition-colors"
                >
                  View Customer
                </button>
                <button
                  onClick={() => dismissToteRequest(req.id)}
                  className="flex-1 border-2 border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Legacy pickup_requested flag on totes */}
      {visiblePickups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Tote Pickup Flags ({visiblePickups.length})
          </h2>
          <p className="text-xs text-gray-400 -mt-2">
            Customer flagged individual totes for pickup from their tote detail page.
          </p>
          {visiblePickups.map(req => (
            <div key={req.toteId} className="card space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm">{req.customerName}</p>
                  <p className="text-xs text-gray-600 font-mono mt-0.5">
                    {req.toteName ? `${req.toteName} · ` : ''}{req.toteId}
                  </p>
                  {req.customerAddress && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{req.customerAddress}</span>
                    </p>
                  )}
                </div>
                <span className="status-pill text-[10px] bg-blue-100 text-blue-700 flex-shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pickup
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => router.push(`/admin/customers/${req.customerId}`)}
                  className="flex-1 bg-brand-navy text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-900 transition-colors"
                >
                  View Customer
                </button>
                <button
                  onClick={() => dismissPickupRequest(req.toteId)}
                  className="flex-1 border-2 border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Clear Flag
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
