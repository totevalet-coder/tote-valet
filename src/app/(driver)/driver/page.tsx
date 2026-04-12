'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { MapPin, ChevronDown, ChevronUp, Navigation, CheckCircle2, AlertCircle, Clock, Package, Truck } from 'lucide-react'

export default function DriverRoutePage() {
  const router = useRouter()
  const supabase = createClient()

  const [route, setRoute] = useState<Route | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverId, setDriverId] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedStop, setExpandedStop] = useState<number | null>(null)
  const [showLoadWarning, setShowLoadWarning] = useState(false)

  const loadRoute = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, role')
      .eq('auth_id', userData.user.id)
      .single()

    if (!customer || customer.role !== 'driver') {
      router.push('/dashboard')
      return
    }

    setDriverName(customer.name)
    setDriverId(customer.id)

    const today = new Date().toISOString().split('T')[0]
    const { data: routes } = await supabase
      .from('routes')
      .select('*')
      .eq('driver_id', customer.id)
      .eq('date', today)
      .neq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)

    if (routes && routes.length > 0) {
      setRoute(routes[0] as Route)
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadRoute() }, [loadRoute])

  function openMaps(address: string) {
    const encoded = encodeURIComponent(address)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank')
  }

  function startDelivering() {
    if (!route) return
    if (route.status === 'planned') {
      setShowLoadWarning(true)
      return
    }
    const firstPending = (route.stops as RouteStop[]).find(s => !s.completed)
    if (firstPending) {
      openMaps(firstPending.address)
      router.push(`/driver/stop/${route.id}/${firstPending.stop_number}`)
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const stops = route ? (route.stops as RouteStop[]) : []
  const completed = stops.filter(s => s.completed).length
  const remaining = stops.filter(s => !s.completed).length
  const totalTotes = stops.reduce((sum, s) => sum + s.tote_ids.length, 0)

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Hero */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <p className="text-white/60 text-xs font-medium mb-0.5">{today}</p>
        <h1 className="font-black text-xl">{driverName || 'Driver'}</h1>
        {route && (
          <p className="text-brand-blue text-xs font-semibold mt-0.5">Route {route.id}</p>
        )}

        {route ? (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: 'Completed', value: completed, icon: '✅' },
              { label: 'Remaining', value: remaining, icon: '📍' },
              { label: 'Total Totes', value: totalTotes, icon: '📦' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-lg">{icon}</p>
                <p className="font-black text-xl mt-0.5">{value}</p>
                <p className="text-white/60 text-[10px] font-medium">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/50 text-sm mt-3">No route assigned for today.</p>
        )}
      </div>

      {/* Start Button */}
      {route && remaining > 0 && (
        <button
          onClick={startDelivering}
          className="w-full flex items-center justify-center gap-3 bg-brand-blue text-white rounded-2xl py-4 font-black text-base shadow-lg hover:bg-blue-500 active:scale-[0.98] transition-all"
        >
          <Navigation className="w-5 h-5" />
          Start Delivering Route
        </button>
      )}

      {route && remaining === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-bold text-green-700">All stops complete!</p>
          <p className="text-green-600 text-sm mt-1">Head to End Route to sync.</p>
        </div>
      )}

      {/* Stop List */}
      {route && stops.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Stops ({stops.length})
          </h2>
          <div className="space-y-3">
            {stops.map((stop) => {
              const isExpanded = expandedStop === stop.stop_number
              const isCompleted = stop.completed
              const isForceCompleted = stop.force_completed

              return (
                <div
                  key={stop.stop_number}
                  className={`card transition-all duration-200 ${isCompleted ? 'opacity-60' : ''}`}
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedStop(isExpanded ? null : stop.stop_number)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    {/* Stop number circle */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm ${
                      isForceCompleted
                        ? 'bg-red-100 text-red-600'
                        : isCompleted
                        ? 'bg-green-100 text-green-600'
                        : 'bg-brand-blue/10 text-brand-blue'
                    }`}>
                      {isForceCompleted ? '!' : isCompleted ? '✓' : stop.stop_number}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-navy text-sm truncate">
                          {stop.customer_name}
                        </span>
                        <span className={`status-pill text-[10px] whitespace-nowrap ${
                          stop.type === 'pickup'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {stop.type === 'pickup' ? 'Pickup' : 'Delivery'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{stop.address}</p>
                      <p className="text-xs text-gray-400">{stop.tote_ids.length} tote{stop.tote_ids.length !== 1 ? 's' : ''}</p>
                    </div>

                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      {/* Tote table */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Totes</p>
                        <div className="space-y-1.5">
                          {stop.tote_ids.map((toteId, i) => (
                            <div key={toteId} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-sm font-mono font-semibold text-brand-navy">{toteId}</span>
                              </div>
                              {stop.seal_numbers?.[i] && (
                                <span className="text-xs text-gray-400 font-mono">
                                  Seal: {stop.seal_numbers[i]}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {stop.notes && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                          <p className="text-xs font-bold text-yellow-700 mb-0.5">Customer Notes</p>
                          <p className="text-xs text-yellow-700">{stop.notes}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isCompleted && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => openMaps(stop.address)}
                            className="flex-1 flex items-center justify-center gap-2 border-2 border-brand-blue text-brand-blue rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-50 transition-colors"
                          >
                            <MapPin className="w-4 h-4" />
                            Navigate
                          </button>
                          <button
                            onClick={() => router.push(`/driver/stop/${route.id}/${stop.stop_number}`)}
                            className="flex-1 flex items-center justify-center gap-2 bg-brand-navy text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-900 transition-colors"
                          >
                            Details
                          </button>
                        </div>
                      )}

                      {isForceCompleted && stop.error_id && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <p className="text-xs text-red-600">Force completed — Error {stop.error_id}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!route && !loading && (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No Route Today</p>
          <p className="text-gray-400 text-sm mt-1">Check back when your route is assigned.</p>
        </div>
      )}
      {/* Must load truck warning */}
      {showLoadWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="font-black text-brand-navy text-lg leading-tight">Load Truck First</h2>
                <p className="text-gray-500 text-sm mt-0.5">You must load and scan all totes before starting your route.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowLoadWarning(false)}
                className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => { setShowLoadWarning(false); router.push('/driver/load-truck') }}
                className="flex-1 py-3 rounded-xl bg-brand-navy text-white font-bold text-sm hover:bg-blue-900 transition-colors"
              >
                Load Truck
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
