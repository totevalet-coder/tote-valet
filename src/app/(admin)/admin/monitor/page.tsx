'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import {
  CheckCircle2, Clock, Truck, Package, MapPin,
  RefreshCw, AlertCircle, PackageCheck, Navigation
} from 'lucide-react'

interface LiveRoute {
  route: Route
  driverName: string
  stops: RouteStop[]
  currentStop: RouteStop | null
  completedCount: number
  totalStops: number
  totalTotes: number
  verifiedTotes: number
  lastUpdated: string
}

const STATUS_CONFIG = {
  planned:     { label: 'Planned',          color: 'bg-gray-100 text-gray-600',    icon: Clock },
  in_progress: { label: 'On Route',         color: 'bg-blue-100 text-blue-700',    icon: Truck },
  returning:   { label: 'Returning',        color: 'bg-orange-100 text-orange-700', icon: PackageCheck },
  complete:    { label: 'Complete',         color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
}

export default function AdminMonitorPage() {
  const router = useRouter()
  const supabase = createClient()

  const [liveRoutes, setLiveRoutes] = useState<LiveRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const today = new Date().toISOString().split('T')[0]

    let q = supabase.from('routes').select('*').order('created_at', { ascending: false })
    if (!showAll) {
      q = q.eq('date', today)
    } else {
      q = q.limit(30)
    }

    const { data: routeData } = await q
    if (!routeData) { setLoading(false); setRefreshing(false); return }

    const built: LiveRoute[] = []
    for (const r of routeData as Route[]) {
      const stops = r.stops as RouteStop[]

      const { data: driver } = await supabase
        .from('customers').select('name').eq('id', r.driver_id ?? '').single()

      const completedCount = stops.filter(s => s.completed).length
      const currentStop = stops.find(s => !s.completed) ?? null
      const totalTotes = stops.reduce((n, s) => n + s.tote_ids.length, 0)

      // Count totes from completed stops
      const verifiedTotes = stops
        .filter(s => s.completed)
        .reduce((n, s) => n + s.tote_ids.length, 0)

      built.push({
        route: r,
        driverName: driver?.name ?? 'Unassigned',
        stops,
        currentStop,
        completedCount,
        totalStops: stops.length,
        totalTotes,
        verifiedTotes,
        lastUpdated: new Date(r.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      })
    }

    setLiveRoutes(built)
    setLastRefresh(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [supabase, showAll])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => load(true), 30000)
    return () => clearInterval(interval)
  }, [load])

  const activeRoutes = liveRoutes.filter(r => r.route.status === 'in_progress' || r.route.status === 'returning')
  const plannedRoutes = liveRoutes.filter(r => r.route.status === 'planned')
  const doneRoutes = liveRoutes.filter(r => r.route.status === 'complete')

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-black text-2xl text-brand-navy">Live Monitor</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs font-bold rounded-xl px-3 py-2 border-2 transition-colors ${showAll ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 text-gray-500'}`}
          >
            {showAll ? 'All Routes' : 'Today'}
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'On Route', value: activeRoutes.length, color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' },
          { label: 'Planned', value: plannedRoutes.length, color: 'bg-gray-50 border-gray-200', textColor: 'text-gray-600' },
          { label: 'Complete', value: doneRoutes.length, color: 'bg-green-50 border-green-200', textColor: 'text-green-700' },
        ].map(({ label, value, color, textColor }) => (
          <div key={label} className={`border-2 rounded-2xl py-3 text-center ${color}`}>
            <p className={`font-black text-2xl ${textColor}`}>{value}</p>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${textColor} opacity-70`}>{label}</p>
          </div>
        ))}
      </div>

      {liveRoutes.length === 0 && (
        <div className="text-center py-16">
          <Navigation className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No routes {showAll ? 'found' : 'today'}</p>
          <button onClick={() => router.push('/admin/routes/new')} className="mt-3 text-brand-blue text-sm font-semibold">
            + Create a Route
          </button>
        </div>
      )}

      {/* Active routes — most important, shown first */}
      {activeRoutes.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Active ({activeRoutes.length})
          </h2>
          <div className="space-y-4">
            {activeRoutes.map(lr => <RouteCard key={lr.route.id} lr={lr} onClick={() => router.push(`/admin/routes/${lr.route.id}`)} />)}
          </div>
        </section>
      )}

      {/* Planned */}
      {plannedRoutes.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Planned ({plannedRoutes.length})
          </h2>
          <div className="space-y-3">
            {plannedRoutes.map(lr => <RouteCard key={lr.route.id} lr={lr} onClick={() => router.push(`/admin/routes/${lr.route.id}`)} />)}
          </div>
        </section>
      )}

      {/* Completed */}
      {doneRoutes.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Completed ({doneRoutes.length})
          </h2>
          <div className="space-y-3">
            {doneRoutes.map(lr => <RouteCard key={lr.route.id} lr={lr} onClick={() => router.push(`/admin/routes/${lr.route.id}`)} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function RouteCard({ lr, onClick }: { lr: LiveRoute; onClick: () => void }) {
  const { route, driverName, stops, currentStop, completedCount, totalStops, totalTotes, verifiedTotes, lastUpdated } = lr
  const cfg = STATUS_CONFIG[route.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.planned
  const StatusIcon = cfg.icon
  const progressPct = totalStops > 0 ? Math.round((completedCount / totalStops) * 100) : 0
  const isActive = route.status === 'in_progress' || route.status === 'returning'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 p-4 space-y-3 transition-all active:scale-[0.99] ${
        isActive ? 'border-brand-blue/30 bg-white shadow-md' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          route.status === 'complete' ? 'bg-green-100' :
          isActive ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          <StatusIcon className={`w-5 h-5 ${
            route.status === 'complete' ? 'text-green-600' :
            isActive ? 'text-blue-600' : 'text-gray-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-brand-navy text-base">{route.id}</span>
            <span className={`status-pill text-[10px] ${cfg.color}`}>{cfg.label}</span>
            {route.force_complete_count > 0 && (
              <span className="status-pill text-[10px] bg-red-100 text-red-700">
                {route.force_complete_count} FC
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{driverName} · {route.date}</p>
        </div>
        <p className="text-xs text-gray-400 flex-shrink-0">
          {lastUpdated}
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{completedCount} of {totalStops} stops</span>
          <span>{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              route.status === 'complete' ? 'bg-green-500' :
              isActive ? 'bg-brand-blue' : 'bg-gray-300'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stop tiles */}
      <div className="flex gap-1.5 flex-wrap">
        {stops.map(s => (
          <div
            key={s.stop_number}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
              s.force_completed ? 'bg-red-100 text-red-600' :
              s.completed ? (s.type === 'pickup' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600') :
              s === currentStop ? 'bg-brand-navy text-white ring-2 ring-brand-blue ring-offset-1' :
              'bg-gray-100 text-gray-400'
            }`}
            title={`${s.customer_name} — ${s.type}`}
          >
            {s.force_completed ? '!' : s.completed ? '✓' : s.stop_number}
          </div>
        ))}
      </div>

      {/* Current stop info */}
      {route.status === 'in_progress' && currentStop && (
        <div className="bg-brand-navy/5 border border-brand-blue/20 rounded-xl px-3 py-2 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-blue flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-brand-navy truncate">{currentStop.customer_name}</p>
            <p className="text-[10px] text-gray-500 truncate">{currentStop.address}</p>
          </div>
          <span className={`status-pill text-[10px] flex-shrink-0 ${currentStop.type === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
            {currentStop.type}
          </span>
        </div>
      )}

      {route.status === 'returning' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <p className="text-xs font-bold text-orange-700">Returning to warehouse to drop totes</p>
        </div>
      )}

      {/* Tote count row */}
      <div className="flex items-center gap-4 pt-0.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Package className="w-3.5 h-3.5" />
          <span>{verifiedTotes}/{totalTotes} totes processed</span>
        </div>
        {route.error_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{route.error_count} error{route.error_count !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </button>
  )
}
