'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CreditCard, Package } from 'lucide-react'

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
}

export default function AdminHomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }
    const { data: me } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    if (!me || me.role !== 'admin') { router.push('/dashboard'); return }

    const today = new Date().toISOString().split('T')[0]

    const [totesRes, customersRes, routesRes, errorsRes] = await Promise.all([
      supabase.from('totes').select('status, bin_location'),
      supabase.from('customers').select('status, monthly_total, role'),
      supabase.from('routes').select('status, stops').eq('date', today),
      supabase.from('errors').select('id').eq('resolved', false),
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

    setStats({
      mrr, activeCustomers, storedTotes, emptyAtCustomer, inTransit, failedPayments,
      driverErrors: errorsRes.data?.length ?? 0,
      unstowedPastCutoff,
      routesRunning, routesTotal, deliveriesScheduled, totesOutForDelivery,
    })
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

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
