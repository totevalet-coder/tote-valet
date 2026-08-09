'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import {
  Plus, ChevronRight, Clock, CheckCircle2, Truck, Navigation,
  RefreshCw, MapPin, AlertCircle, PackageCheck,
} from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import { todayStr as businessTodayStr } from '@/lib/date'
import { listWarehouses } from '@/lib/warehouses'
import type { Warehouse } from '@/types/database'

interface EnrichedRoute extends Route {
  driverName: string
  driverEmail: string
  fullCount: number
  emptyCount: number
}

const STATUS_STYLES: Record<string, string> = {
  planned:    'bg-gray-100 text-gray-600',
  in_progress:'bg-blue-100 text-blue-700',
  returning:  'bg-orange-100 text-orange-700',
  complete:   'bg-green-100 text-green-700',
}

export default function AdminRoutesPage() {
  const router = useRouter()
  const supabase = createClient()
  const todayStr = businessTodayStr()
  const [routes, setRoutes] = useState<EnrichedRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Multi-warehouse readiness — every route carries a real warehouse_id
  // now. '' means "all warehouses". See CLAUDE.md's Warehouses & Locations
  // section.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState('')

  useEffect(() => { listWarehouses(supabase).then(setWarehouses) }, [supabase])
  const warehouseCode = (id: string | null) => warehouses.find(w => w.id === id)?.code ?? '—'

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)

    let q = supabase.from('routes').select('*').order('created_at', { ascending: false })
    q = showAll ? q.limit(50) : q.eq('date', selectedDate)
    if (warehouseFilter) q = q.eq('warehouse_id', warehouseFilter)

    const { data: routeData } = await q
    if (!routeData) { setLoading(false); setRefreshing(false); return }

    // Full/empty breakdown needs each referenced tote's current item count.
    const allToteIds = [...new Set((routeData as Route[]).flatMap(r => (r.stops as RouteStop[]).flatMap(s => s.tote_ids)))]
    const itemCountByTote = new Map<string, number>()
    if (allToteIds.length > 0) {
      const { data: toteItems } = await supabase.from('totes').select('id, items').in('id', allToteIds)
      for (const t of toteItems ?? []) itemCountByTote.set(t.id, ((t.items as { label: string }[] | null) ?? []).length)
    }

    const enriched = await Promise.all((routeData as Route[]).map(async r => {
      const { data: driver } = await supabase.from('customers').select('name, email').eq('id', r.driver_id ?? '').single()
      let fullCount = 0, emptyCount = 0
      for (const s of r.stops as RouteStop[]) {
        for (const toteId of s.tote_ids) {
          if ((itemCountByTote.get(toteId) ?? 0) > 0) fullCount++
          else emptyCount++
        }
        // Generic empties not yet scanned/registered — not real tote rows yet
        emptyCount += Math.max(0, (s.expected_empty_count ?? 0) - s.tote_ids.length)
      }
      return { ...r, driverName: driver?.name ?? 'Unassigned', driverEmail: driver?.email ?? '', fullCount, emptyCount }
    }))

    setRoutes(enriched)
    setLoading(false)
    setRefreshing(false)
  }, [supabase, showAll, selectedDate, warehouseFilter])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s, same as the old Live Monitor page did
  useEffect(() => {
    const interval = setInterval(() => load(true), 30000)
    return () => clearInterval(interval)
  }, [load])

  const onRoute = routes.filter(r => r.status === 'in_progress' || r.status === 'returning').length
  const planned = routes.filter(r => r.status === 'planned').length
  const complete = routes.filter(r => r.status === 'complete').length
  const selected = routes.find(r => r.id === selectedId) ?? null

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Routes</h1>
        <div className="flex items-center gap-2">
          {warehouses.length > 1 && (
            <select
              value={warehouseFilter}
              onChange={e => setWarehouseFilter(e.target.value)}
              className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600"
            >
              <option value="">All Warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code}</option>)}
            </select>
          )}
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setShowAll(false) }}
            disabled={showAll}
            className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {selectedDate !== todayStr && !showAll && (
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-500 hover:border-gray-300"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs font-bold rounded-xl px-3 py-2.5 border-2 transition-colors ${showAll ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 text-gray-500'}`}
          >
            All Routes
          </button>
          <button
            onClick={() => load(true)} disabled={refreshing}
            className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => router.push('/admin/routes/new')}
            className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-blue-900 transition-colors"
          >
            <Plus className="w-4 h-4" /> Generate Routes
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <StatCard label="On Route" value={onRoute} valueColor="text-blue-600" />
        <StatCard label="Planned" value={planned} valueColor="text-gray-500" />
        <StatCard label="Complete" value={complete} valueColor="text-green-600" />
      </div>

      {/* Table */}
      {routes.length === 0 ? (
        <div className="text-center py-16">
          <Navigation className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">
            No routes {showAll ? 'found' : selectedDate === todayStr ? 'today' : `on ${selectedDate}`}
          </p>
          <button onClick={() => router.push('/admin/routes/new')} className="mt-3 text-brand-blue text-sm font-semibold">
            + Generate Routes
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Route</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Stops</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Totes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {routes.map(r => {
                  const stops = r.stops as RouteStop[]
                  const done = stops.filter(s => s.completed).length
                  const pct = stops.length > 0 ? Math.round((done / stops.length) * 100) : 0
                  const isActive = r.status === 'in_progress' || r.status === 'returning'
                  const isSelected = r.id === selectedId
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(isSelected ? null : r.id)}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-brand-navy/5' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.status === 'complete' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> :
                           isActive ? <Truck className="w-4 h-4 text-blue-500" /> : <Clock className="w-4 h-4 text-gray-400" />}
                          <span className="font-mono font-bold text-brand-navy">{r.id}</span>
                          {r.force_complete_count > 0 && (
                            <span className="status-pill text-[10px] bg-red-100 text-red-700">{r.force_complete_count} FC</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700 font-medium">{r.driverName}</p>
                        <p className="text-xs text-gray-400">
                          {r.driverEmail} · {r.date}
                          {warehouses.length > 1 && <> · {warehouseCode(r.warehouse_id)}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`status-pill text-[10px] ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${r.status === 'complete' ? 'bg-green-500' : isActive ? 'bg-brand-blue' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{done}/{stops.length}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {r.emptyCount > 0 && <span>{r.emptyCount} empty</span>}
                        {r.emptyCount > 0 && r.fullCount > 0 && <span className="text-gray-300"> · </span>}
                        {r.fullCount > 0 && <span>{r.fullCount} full</span>}
                        {r.emptyCount === 0 && r.fullCount === 0 && <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${isSelected ? 'rotate-90' : ''}`} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inline Stop Detail */}
      {selected && <StopDetail route={selected} onViewFull={() => router.push(`/admin/routes/${selected.id}`)} />}
    </div>
  )
}

function StopDetail({ route, onViewFull }: { route: EnrichedRoute; onViewFull: () => void }) {
  const stops = route.stops as RouteStop[]
  const done = stops.filter(s => s.completed).length

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-brand-navy">{route.id} — Stop Detail</h2>
          <p className="text-xs text-gray-400">{route.driverName} ({route.driverEmail}) · {done} of {stops.length} stops</p>
        </div>
        <button onClick={onViewFull} className="text-xs font-semibold text-brand-blue hover:underline">
          View Full Route →
        </button>
      </div>

      {route.status === 'returning' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <p className="text-xs font-bold text-orange-700">Returning to warehouse to drop totes</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Stop</th>
              <th className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Customer</th>
              <th className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Type</th>
              <th className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Totes</th>
              <th className="px-3 py-2 text-xs font-bold text-gray-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {stops.map(s => (
              <tr key={s.stop_number} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2.5 font-bold text-brand-navy">{s.stop_number}</td>
                <td className="px-3 py-2.5">
                  <p className="text-gray-700">{s.customer_name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.address}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`status-pill text-[10px] ${s.type === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{s.type}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {s.expected_empty_count
                    ? `${s.tote_ids.length}/${s.expected_empty_count} empties scanned`
                    : s.tote_ids.length}
                </td>
                <td className="px-3 py-2.5">
                  {s.force_completed ? (
                    <span className="flex items-center gap-1 text-amber-600 font-semibold text-xs">
                      <AlertCircle className="w-3.5 h-3.5" /> Force completed
                    </span>
                  ) : s.completed ? (
                    <span className="status-pill text-[10px] bg-green-100 text-green-700">Done</span>
                  ) : (
                    <span className="status-pill text-[10px] bg-gray-100 text-gray-500">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
