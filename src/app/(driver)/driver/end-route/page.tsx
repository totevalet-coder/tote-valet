'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { CheckCircle2, AlertCircle, Truck, Package } from 'lucide-react'

export default function EndRoutePage() {
  const router = useRouter()
  const supabase = createClient()

  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [syncResult, setSyncResult] = useState({
    delivered: 0,
    pickedUp: 0,
    forceCompletes: 0,
    errors: 0,
  })

  const loadRoute = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_id', userData.user.id)
      .single()
    if (!customer) return

    const today = new Date().toISOString().split('T')[0]
    const { data: routes } = await supabase
      .from('routes')
      .select('*')
      .eq('driver_id', customer.id)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)

    if (routes && routes.length > 0) {
      setRoute(routes[0] as Route)
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadRoute() }, [loadRoute])

  const STATION_ADDRESS = '6582 Gun Club Rd, Coopersburg, PA 18036'

  async function handleSync() {
    if (!route) return
    setSyncing(true)

    const stops = route.stops as RouteStop[]
    let delivered = 0
    let pickedUp = 0

    for (const stop of stops) {
      if (!stop.completed || stop.force_completed) continue
      if (stop.type === 'delivery') delivered += stop.tote_ids.length
      if (stop.type === 'pickup') pickedUp += stop.tote_ids.length
    }

    // Mark route complete
    await supabase.from('routes').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', route.id)

    setSyncResult({
      delivered,
      pickedUp,
      forceCompletes: route.force_complete_count,
      errors: route.error_count,
    })
    setSyncing(false)
    setSynced(true)

    // Open Google Maps to station
    const encoded = encodeURIComponent(STATION_ADDRESS)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank')
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  // ─── Post-Sync Completion Screen ─────────────────────────────────────────
  if (synced) {
    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-black text-2xl text-brand-navy">Route Synced!</h2>
          <p className="text-gray-500 text-sm mt-1">Great work today. All data has been saved.</p>
        </div>

        <div className="card space-y-3">
          {[
            { label: 'Totes Delivered', value: syncResult.delivered, icon: '📦', color: 'text-brand-blue' },
            { label: 'Totes Picked Up', value: syncResult.pickedUp, icon: '🚐', color: 'text-brand-navy' },
            { label: 'Force Completions', value: syncResult.forceCompletes, icon: '⚠️', color: 'text-orange-600' },
            { label: 'Errors Flagged', value: syncResult.errors, icon: '🚩', color: 'text-red-600' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
              <span className={`font-black text-lg ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl px-5 py-4 space-y-1.5">
          <p className="text-xs font-bold text-brand-navy">Auto-notifications sent</p>
          <p className="text-xs text-gray-500">✓ Warehouse pick list updated</p>
          <p className="text-xs text-gray-500">✓ Customer SMS notifications queued</p>
        </div>

        <button
          onClick={() => {
            const encoded = encodeURIComponent(STATION_ADDRESS)
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank')
            router.push('/driver')
          }}
          className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
        >
          Navigate Back to Station
        </button>
      </div>
    )
  }

  if (!route) {
    return (
      <div className="px-5 pt-12 text-center">
        <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-400 text-lg">No Route Found</p>
        <p className="text-gray-400 text-sm mt-1">No active route for today.</p>
      </div>
    )
  }

  const stops = route.stops as RouteStop[]
  const completedStops = stops.filter(s => s.completed)
  const pendingStops = stops.filter(s => !s.completed)
  const totalPickedUp = stops.filter(s => s.completed && s.type === 'pickup' && !s.force_completed)
    .reduce((sum, s) => sum + s.tote_ids.length, 0)
  const totalDelivered = stops.filter(s => s.completed && s.type === 'delivery' && !s.force_completed)
    .reduce((sum, s) => sum + s.tote_ids.length, 0)

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <p className="text-white/60 text-xs font-medium">Route {route.id}</p>
        <h1 className="font-black text-xl">End Route</h1>
        <p className="text-white/60 text-sm mt-1">Review and sync all route data.</p>
      </div>

      {/* Pending warning */}
      {pendingStops.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-yellow-700">{pendingStops.length} stop{pendingStops.length !== 1 ? 's' : ''} not yet completed</p>
            <p className="text-xs text-yellow-600 mt-0.5">You can still sync, but incomplete stops will be flagged.</p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="card space-y-3">
        <h3 className="font-bold text-brand-navy text-sm">Route Summary</h3>
        {[
          { label: 'Driver', value: '' },
          { label: 'Date', value: new Date(route.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
          { label: 'Stops completed', value: `${completedStops.length} / ${stops.length}` },
          { label: 'Totes picked up', value: totalPickedUp },
          { label: 'Totes delivered', value: totalDelivered },
          { label: 'Force completions', value: route.force_complete_count },
          { label: 'Errors', value: route.error_count },
        ].map(({ label, value }) => (
          value !== '' && (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-semibold text-brand-navy">{value}</span>
            </div>
          )
        ))}
      </div>

      {/* Status preview */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Tote Status Preview
        </h2>
        <div className="space-y-2">
          {stops.map(stop => (
            <div key={stop.stop_number} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500">Stop {stop.stop_number}</span>
                <span className="text-xs font-semibold text-gray-700">{stop.customer_name}</span>
                {stop.force_completed && (
                  <span className="status-pill bg-red-100 text-red-700 text-xs">Force Completed</span>
                )}
              </div>
              {stop.tote_ids.map(toteId => (
                <div key={toteId} className="flex items-center justify-between py-1.5 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-mono text-brand-navy">{toteId}</span>
                  </div>
                  <span className={`status-pill text-xs ${
                    !stop.completed ? 'bg-gray-100 text-gray-500' :
                    stop.force_completed ? 'bg-orange-100 text-orange-700' :
                    stop.type === 'pickup' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {!stop.completed ? 'Pending' :
                     stop.force_completed ? 'Force Complete' :
                     stop.type === 'pickup' ? '→ In Transit' : '→ At Customer'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Sync button */}
      {route.status !== 'complete' ? (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg disabled:opacity-60"
        >
          {syncing ? (
            <>Syncing...</>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Confirm &amp; Sync to Database
            </>
          )}
        </button>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-1" />
          <p className="font-bold text-green-700">Route already synced</p>
        </div>
      )}
    </div>
  )
}
