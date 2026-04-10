'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CreditCard, Package, ClipboardList, Loader2, CheckCircle2, Truck } from 'lucide-react'

interface PickupRequest {
  toteId: string
  toteName: string | null
  customerName: string
  customerAddress: string | null
  customerId: string
}

interface AdminStats {
  mrr: number
  activeCustomers: number
  storedTotes: number
  emptyAtCustomer: number
  inTransit: number
  failedPayments: number
  driverErrors: number
  unstowedPastCutoff: number
  routesRunning: number
  routesTotal: number
  deliveriesScheduled: number
  totesOutForDelivery: number
  pickupRequests: number
}

export default function AdminHomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedId, setGeneratedId] = useState<string | null>(null)
  const [pickupRequests, setPickupRequests] = useState<PickupRequest[]>([])
  const [dismissedPickup, setDismissedPickup] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }
    const { data: me } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    if (!me || me.role !== 'admin') { router.push('/dashboard'); return }

    const today = new Date().toISOString().split('T')[0]

    const [totesRes, customersRes, routesRes, errorsRes, pickupRes] = await Promise.all([
      supabase.from('totes').select('status, bin_location'),
      supabase.from('customers').select('status, monthly_total, role'),
      supabase.from('routes').select('status, stops').eq('date', today),
      supabase.from('errors').select('id').eq('resolved', false),
      supabase.from('totes').select('id, tote_name, customer_id, customers(name, address)').eq('pickup_requested', true),
    ])

    const totes = totesRes.data ?? []
    const customers = customersRes.data ?? []
    const routes = routesRes.data ?? []

    const activeCustomers = customers.filter(c => c.role === 'customer' && c.status === 'active').length
    const mrr = customers.filter(c => c.role === 'customer').reduce((s, c) => s + (c.monthly_total ?? 0), 0)
    const failedPayments = customers.filter(c => c.status === 'failed_payment').length

    const storedTotes = totes.filter(t => t.status === 'stored').length
    const emptyAtCustomer = totes.filter(t => t.status === 'empty_at_customer').length
    const inTransit = totes.filter(t => t.status === 'in_transit').length
    const unstowedPastCutoff = totes.filter(t => t.status === 'ready_to_stow').length

    const routesRunning = routes.filter(r => r.status === 'in_progress').length
    const routesTotal = routes.length

    let deliveriesScheduled = 0
    let totesOutForDelivery = 0
    for (const r of routes) {
      const stops = (r.stops as { type: string; tote_ids: string[] }[]) ?? []
      deliveriesScheduled += stops.filter(s => s.type === 'delivery').length
      totesOutForDelivery += stops.filter(s => s.type === 'delivery').reduce((s, st) => s + st.tote_ids.length, 0)
    }

    // Build pickup request list
    const requests: PickupRequest[] = (pickupRes.data ?? []).map((t: { id: string; tote_name: string | null; customer_id: string; customers: { name: string; address: string | null } | null }) => ({
      toteId: t.id,
      toteName: t.tote_name,
      customerName: t.customers?.name ?? 'Unknown',
      customerAddress: t.customers?.address ?? null,
      customerId: t.customer_id,
    }))
    setPickupRequests(requests)

    setStats({
      mrr, activeCustomers, storedTotes, emptyAtCustomer, inTransit, failedPayments,
      driverErrors: errorsRes.data?.length ?? 0,
      unstowedPastCutoff,
      routesRunning, routesTotal, deliveriesScheduled, totesOutForDelivery,
      pickupRequests: requests.length,
    })
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  async function generatePickList() {
    setGenerating(true)
    setGeneratedId(null)

    // Find all pending_pick totes
    const { data: totes } = await supabase
      .from('totes')
      .select('id, bin_location, customer_id')
      .eq('status', 'pending_pick')

    if (!totes || totes.length === 0) {
      alert('No totes are currently pending pick.')
      setGenerating(false)
      return
    }

    // Get customer names
    const customerIds = [...new Set(totes.map(t => t.customer_id))]
    const { data: customers } = await supabase
      .from('customers').select('id, name').in('id', customerIds)
    const nameMap: Record<string, string> = {}
    ;(customers ?? []).forEach(c => { nameMap[c.id] = c.name })

    // Group by bin
    const binMap: Record<string, { tote_id: string; customer_name: string; status: string }[]> = {}
    for (const tote of totes) {
      const bin = tote.bin_location ?? 'UNASSIGNED'
      if (!binMap[bin]) binMap[bin] = []
      binMap[bin].push({ tote_id: tote.id, customer_name: nameMap[tote.customer_id] ?? '', status: 'pending' })
    }

    // Build ID: PL-YYYY-DDD, suffix -B if collision
    const now = new Date()
    const year = now.getFullYear()
    const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 0).getTime()) / 86400000)
    const baseId = `PL-${year}-${String(dayOfYear).padStart(3, '0')}`
    const { data: existing } = await supabase.from('pick_lists').select('id').eq('id', baseId).maybeSingle()
    const id = existing ? `${baseId}-B` : baseId

    const bins = Object.entries(binMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bin_id, toteList]) => ({ bin_id, totes: toteList }))

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('pick_lists').insert({
      id,
      generated_by: userData.user?.id ?? 'admin',
      generated_at: now.toISOString(),
      status: 'ready',
      assigned_to: null,
      bins,
      completed_at: null,
    })

    if (!error) {
      setGeneratedId(id)
      load()
    }
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Alert Banners */}
      <div className="space-y-2">
        {stats.driverErrors > 0 && (
          <button onClick={() => router.push('/admin/errors')}
            className="w-full flex items-center gap-3 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 text-left hover:bg-red-100 transition-colors">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">{stats.driverErrors} Driver Error{stats.driverErrors !== 1 ? 's' : ''} Need Review</p>
              <p className="text-xs text-red-600">Tap to review and resolve</p>
            </div>
          </button>
        )}
        {stats.failedPayments > 0 && (
          <button onClick={() => router.push('/admin/billing?tab=failed')}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 transition-colors">
            <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{stats.failedPayments} Failed Payment{stats.failedPayments !== 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-600">Tap to retry or suspend</p>
            </div>
          </button>
        )}
        {stats.pickupRequests > 0 && (
          <div className="w-full flex items-center gap-3 bg-blue-50 border border-blue-300 rounded-2xl px-4 py-3 text-left">
            <Truck className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-800">{stats.pickupRequests} Pickup Request{stats.pickupRequests !== 1 ? 's' : ''} Pending</p>
              <p className="text-xs text-blue-600">Customers are ready for their totes to be picked up</p>
            </div>
          </div>
        )}
        {stats.unstowedPastCutoff > 0 && (
          <button onClick={() => router.push('/warehouse/scan-store?tab=unstowed')}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 transition-colors">
            <Package className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{stats.unstowedPastCutoff} Tote{stats.unstowedPastCutoff !== 1 ? 's' : ''} Unstowed</p>
              <p className="text-xs text-amber-600">Tap to view warehouse</p>
            </div>
          </button>
        )}
      </div>

      {/* Business Metrics */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Business Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Monthly Revenue', value: `$${stats.mrr.toFixed(0)}`, emoji: '💰', color: 'text-green-600' },
            { label: 'Active Customers', value: stats.activeCustomers, emoji: '👥', color: 'text-brand-navy' },
            { label: 'Stored in Warehouse', value: stats.storedTotes, emoji: '🏢', color: 'text-brand-blue' },
            { label: 'Empty at Customer', value: stats.emptyAtCustomer, emoji: '🗃️', color: 'text-gray-500' },
            { label: 'In Transit Today', value: stats.inTransit, emoji: '🚐', color: 'text-yellow-600' },
            { label: 'Failed Payments', value: stats.failedPayments, emoji: '⚠️', color: stats.failedPayments > 0 ? 'text-red-600' : 'text-gray-400' },
          ].map(({ label, value, emoji, color }) => (
            <div key={label} className="card text-center py-4">
              <span className="text-2xl">{emoji}</span>
              <p className={`font-black text-2xl mt-1 ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="space-y-2">
          {generatedId && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-green-800">Pick List {generatedId} created</p>
                <p className="text-xs text-green-600">Warehouse can now start picking</p>
              </div>
              <button onClick={() => setGeneratedId(null)} className="text-green-400 hover:text-green-600 text-lg leading-none">×</button>
            </div>
          )}
          <button
            onClick={generatePickList}
            disabled={generating}
            className="w-full flex items-center gap-4 bg-white border-2 border-brand-blue text-brand-navy rounded-2xl px-5 py-4 hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
              {generating ? <Loader2 className="w-5 h-5 text-brand-blue animate-spin" /> : <ClipboardList className="w-5 h-5 text-brand-blue" />}
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">{generating ? 'Generating…' : 'Generate Pick List'}</p>
              <p className="text-xs text-gray-400">Pulls all pending-pick totes from warehouse</p>
            </div>
          </button>
        </div>
      </section>

      {/* Pickup Requests */}
      {pickupRequests.filter(r => !dismissedPickup.has(r.toteId)).length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Pickup Requests</h2>
          <div className="space-y-2">
            {pickupRequests.filter(r => !dismissedPickup.has(r.toteId)).map(req => (
              <div key={req.toteId} className="card flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm">{req.customerName}</p>
                  <p className="text-xs text-gray-500">{req.toteName ?? req.toteId}</p>
                  {req.customerAddress && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{req.customerAddress}</p>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/admin/customers/${req.customerId}`)}
                  className="text-xs text-brand-blue font-semibold flex-shrink-0"
                >
                  View
                </button>
                <button
                  onClick={() => setDismissedPickup(prev => new Set([...prev, req.toteId]))}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today's Operations */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Today&apos;s Operations</h2>
        <div className="card space-y-3">
          {[
            { label: 'Routes Running', value: `${stats.routesRunning} of ${stats.routesTotal}` },
            { label: 'Deliveries Scheduled', value: `${stats.deliveriesScheduled} stops` },
            { label: 'Totes Out for Delivery', value: stats.totesOutForDelivery },
            { label: 'Driver Errors (Unresolved)', value: stats.driverErrors },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold text-brand-navy">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
