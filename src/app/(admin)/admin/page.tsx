'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RouteStop, PickListBin, DashboardThresholds } from '@/types/database'
import {
  Package, ClipboardList, Boxes, Truck as TruckIcon, CheckCircle2, Shuffle, ArrowRight,
} from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import PaceIndicator from '@/components/admin/PaceIndicator'
import { todayStr, BUSINESS_TIMEZONE } from '@/lib/date'
import { listWarehouses } from '@/lib/warehouses'
import type { Warehouse } from '@/types/database'

interface DashboardStats {
  // Inbound Today
  receivedToday: number
  expectedToday: number
  fullToday: number
  emptyToday: number
  // Unstowed
  unstowed: number
  // Open Pick Lists
  openPickLists: number
  openPickListTotes: number
  // In Drop Zone (picked, awaiting sort)
  inDropZone: number
  // Staged & Ready
  stagedReady: number
  // Bin Capacity
  binSpacesAvailable: number
  binTotalCapacity: number
  // Driver Operations
  routesCreated: number
  routesTarget: number
  fullTotesPickedUp: number
  fullTotesPickedUpTarget: number
  emptyTotesDelivered: number
  emptyTotesDeliveredTarget: number
  fullTotesDelivered: number
  fullTotesDeliveredTarget: number
  thresholds: DashboardThresholds | null
}

// Direct (high = bad) or inverted (low = bad) threshold coloring, shared by
// every stat tile whose color is driven by Settings > Thresholds.
function thresholdColor(value: number, warn: number, critical: number, invert = false) {
  const bad = invert ? value <= critical : value >= critical
  const warning = invert ? value <= warn : value >= warn
  if (bad) return 'text-red-600'
  if (warning) return 'text-amber-600'
  return 'text-brand-navy'
}

// Fixed 6:00a–2:00p shift window used to compute "% of shift elapsed" for the
// pace cards below — matches TopBar's shift badge. No real shift-schedule
// data model exists yet; this is a display-only placeholder until one does.
function getShiftElapsedPct() {
  const now = new Date()
  const start = new Date(now); start.setHours(6, 0, 0, 0)
  const end = new Date(now); end.setHours(14, 0, 0, 0)
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)
}

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Multi-warehouse readiness — Unstowed and In Drop Zone are the only
  // tiles derivable by warehouse today (via totes.current_location_id ->
  // locations.warehouse_id, populated by the driver-return and pick-list-
  // completion flows). Every other tile stays combined-only until bins
  // themselves are warehouse-scoped (deliberately deferred — see
  // CLAUDE.md's Warehouses & Locations section). '' means "all warehouses".
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState('')

  useEffect(() => { listWarehouses(supabase).then(setWarehouses) }, [supabase])

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }
    const { data: me } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    if (!me || me.role !== 'admin') { router.push('/dashboard'); return }

    const today = todayStr()

    const [totesRes, binsRes, pickListsRes, driversRes, todaysRoutesRes, thresholdsRes, locationsRes] = await Promise.all([
      supabase.from('totes').select('id, status, items, current_location_id'),
      supabase.from('bins').select('capacity, current_count'),
      supabase.from('pick_lists').select('id, bins').neq('status', 'complete'),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('role', 'driver').eq('status', 'active'),
      supabase.from('routes').select('id, stops').eq('date', today),
      supabase.from('dashboard_thresholds').select('*').eq('id', 1).maybeSingle(),
      supabase.from('locations').select('id, warehouse_id'),
    ])
    const thresholds = thresholdsRes.data as DashboardThresholds | null

    const totes = totesRes.data ?? []
    const bins = binsRes.data ?? []
    const todaysRoutes = todaysRoutesRes.data ?? []

    // Bin capacity
    const binTotalCapacity = bins.reduce((s, b) => s + b.capacity, 0)
    const binUsed = bins.reduce((s, b) => s + b.current_count, 0)
    const binSpacesAvailable = binTotalCapacity - binUsed

    // Which locations belong to the currently-filtered warehouse (if any) —
    // used below to scope Unstowed/In Drop Zone by warehouse via each
    // tote's current_location_id. No filter = every location counts.
    const filteredLocationIds = warehouseFilter
      ? new Set((locationsRes.data ?? []).filter(l => l.warehouse_id === warehouseFilter).map(l => l.id))
      : null

    // Unstowed / In Drop Zone / Staged & Ready
    const matchesWarehouseFilter = (t: { current_location_id: string | null }) =>
      !filteredLocationIds || (t.current_location_id != null && filteredLocationIds.has(t.current_location_id))
    const unstowed = totes.filter(t => t.status === 'ready_to_stow' && matchesWarehouseFilter(t)).length
    const inDropZone = totes.filter(t => t.status === 'picked' && matchesWarehouseFilter(t)).length
    // Staged & Ready isn't derivable by warehouse yet -- Sort's zone
    // logic uses the route id as its label, not a locations row (left
    // untouched deliberately, see CLAUDE.md) -- so this stays combined
    // regardless of the filter.
    const stagedReady = totes.filter(t => t.status === 'returned_to_station').length

    // Open Pick Lists
    let openPickListTotes = 0
    for (const pl of pickListsRes.data ?? []) {
      const binsArr = pl.bins as PickListBin[]
      openPickListTotes += binsArr.reduce((s, b) => s + b.totes.length, 0)
    }
    const openPickLists = pickListsRes.data?.length ?? 0

    // Inbound Today — expected = tote_ids on today's pickup-type stops.
    // Reused from the same approach on the Warehouse dashboard.
    const toteById = new Map(totes.map(t => [t.id, t]))
    const expectedToteIds = new Set<string>()
    const pickupStopsById = new Map<string, RouteStop>()
    const deliveryStopsById = new Map<string, RouteStop>()
    for (const r of todaysRoutes) {
      const stops = r.stops as RouteStop[]
      for (const s of stops) {
        if (s.type === 'pickup') {
          s.tote_ids.forEach(id => { expectedToteIds.add(id); pickupStopsById.set(id, s) })
        } else {
          s.tote_ids.forEach(id => deliveryStopsById.set(id, s))
        }
      }
    }
    let receivedToday = 0, fullToday = 0, emptyToday = 0
    for (const id of expectedToteIds) {
      const t = toteById.get(id)
      if (!t) continue
      if (t.status !== 'in_transit') receivedToday++
      if ((t.items?.length ?? 0) > 0) fullToday++
      else emptyToday++
    }

    // Driver Operations — Today
    const routesCreated = todaysRoutes.length
    const routesTarget = driversRes.count ?? 0

    // Approximation: a stop's completion + the tote's *current* item count as a
    // proxy for full/empty at pickup/delivery time (per-stop full/empty isn't
    // separately tracked). Good enough for a pace indicator, not exact audit data.
    let fullTotesPickedUp = 0
    for (const [id, stop] of pickupStopsById) {
      const t = toteById.get(id)
      if (t && (t.items?.length ?? 0) > 0 && stop.completed) fullTotesPickedUp++
    }
    const fullTotesPickedUpTarget = [...pickupStopsById.keys()].filter(
      id => (toteById.get(id)?.items?.length ?? 0) > 0
    ).length

    let emptyTotesDelivered = 0
    for (const [id, stop] of deliveryStopsById) {
      const t = toteById.get(id)
      if (t && (t.items?.length ?? 0) === 0 && stop.completed) emptyTotesDelivered++
    }
    const emptyTotesDeliveredTarget = [...deliveryStopsById.keys()].filter(
      id => (toteById.get(id)?.items?.length ?? 0) === 0
    ).length

    // Full totes delivered — a stored tote of real belongings being sent
    // back to its customer (full_tote_delivery), same approximation as the
    // other pace metrics: current item count + stop completion as a proxy.
    let fullTotesDelivered = 0
    for (const [id, stop] of deliveryStopsById) {
      const t = toteById.get(id)
      if (t && (t.items?.length ?? 0) > 0 && stop.completed) fullTotesDelivered++
    }
    const fullTotesDeliveredTarget = [...deliveryStopsById.keys()].filter(
      id => (toteById.get(id)?.items?.length ?? 0) > 0
    ).length

    setStats({
      receivedToday, expectedToday: expectedToteIds.size, fullToday, emptyToday,
      unstowed,
      openPickLists, openPickListTotes,
      inDropZone,
      stagedReady,
      binSpacesAvailable, binTotalCapacity,
      routesCreated, routesTarget,
      fullTotesPickedUp, fullTotesPickedUpTarget,
      emptyTotesDelivered, emptyTotesDeliveredTarget,
      fullTotesDelivered, fullTotesDeliveredTarget,
      thresholds,
    })
    setLoading(false)
  }, [supabase, router, warehouseFilter])

  useEffect(() => { load() }, [load])

  if (loading || !stats) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  // Explicit business timezone, not the viewing device's own — this is the
  // date every other page's "Today" defaults to, so it needs to be right
  // regardless of what timezone the admin happens to be viewing from.
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: BUSINESS_TIMEZONE })
  const elapsedPct = getShiftElapsedPct()
  // Fall back to the same defaults seeded in the schema if the row is somehow missing
  const t = stats.thresholds ?? {
    unstowed_warn: 5, unstowed_critical: 15,
    routes_today_warn: 1, routes_today_critical: 3,
    empty_totes_pace_amber_pts: 10, empty_totes_pace_red_pts: 25,
    full_totes_pace_amber_pts: 10, full_totes_pace_red_pts: 25,
    empty_bins_warn: 10, empty_bins_critical: 4,
    open_pick_totes_warn: 48, open_pick_totes_critical: 78,
  }
  const routesDeficit = stats.routesTarget - stats.routesCreated
  const routesSeverity = routesDeficit >= t.routes_today_critical ? 'critical' : routesDeficit >= t.routes_today_warn ? 'warn' : 'ok'

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium">{today}</p>
          <h1 className="font-black text-2xl text-brand-navy">Dashboard</h1>
        </div>
        {warehouses.length > 1 && (
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600"
            title="Only narrows Unstowed / In Drop Zone -- other tiles stay combined until bins are warehouse-scoped"
          >
            <option value="">All Warehouses (combined)</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} only</option>)}
          </select>
        )}
      </div>

      {/* Top summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          label="Inbound Today"
          value={stats.receivedToday}
          total={stats.expectedToday || undefined}
          subtext={stats.expectedToday > 0 ? `${stats.fullToday} full · ${stats.emptyToday} empty` : 'No pickups scheduled'}
          icon={TruckIcon}
          linkLabel="View Inbound"
          linkHref="/admin/inbound"
        />
        <StatCard
          label="Unstowed"
          value={stats.unstowed}
          subtext="On the floor, awaiting a bin"
          icon={Package}
          valueColor={thresholdColor(stats.unstowed, t.unstowed_warn, t.unstowed_critical)}
          linkLabel="View in Inbound"
          linkHref="/admin/inbound"
        />
        <StatCard
          label="Open Pick Lists"
          value={stats.openPickLists}
          subtext={`${stats.openPickListTotes} totes across ${stats.openPickLists} list${stats.openPickLists !== 1 ? 's' : ''}`}
          icon={ClipboardList}
          valueColor={thresholdColor(stats.openPickListTotes, t.open_pick_totes_warn, t.open_pick_totes_critical)}
          linkLabel="View Picking Overview"
          linkHref="/admin/pick-lists"
        />
        <StatCard
          label="In Drop Zone"
          value={stats.inDropZone}
          subtext="Picked, awaiting sort"
          icon={Shuffle}
          valueColor="text-amber-600"
          linkLabel="View Sort"
          linkHref="/admin/sort"
        />
        <StatCard
          label="Staged & Ready"
          value={stats.stagedReady}
          subtext="Complete, ready for truck"
          icon={CheckCircle2}
          valueColor="text-green-600"
          linkLabel="View in Inventory"
          linkHref="/admin/totes?status=returned_to_station"
        />
        <StatCard
          label="Bin Capacity"
          value={stats.binSpacesAvailable}
          total={stats.binTotalCapacity}
          subtext="empty of total capacity"
          icon={Boxes}
          valueColor={thresholdColor(stats.binSpacesAvailable, t.empty_bins_warn, t.empty_bins_critical, true)}
          linkLabel="View in Inventory"
          linkHref="/admin/totes"
        />
      </div>

      {/* Driver Operations */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Driver Operations — Today</h2>
          <span className="text-[10px] text-gray-400 font-semibold">6:00a–2:00p shift · {elapsedPct}% elapsed</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Routes Today</p>
              {routesSeverity !== 'ok' && (
                <span className={`status-pill text-[10px] font-bold ${routesSeverity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  Needs Attention
                </span>
              )}
            </div>
            <p className="font-black text-2xl text-brand-navy">
              {stats.routesCreated}<span className="text-gray-300 text-lg font-bold"> / {stats.routesTarget}</span>
            </p>
            <p className="text-xs text-gray-400">
              {routesDeficit > 0
                ? `${routesDeficit} route${routesDeficit !== 1 ? 's' : ''} still need to be created`
                : 'All active drivers have a route today'}
            </p>
            <button
              onClick={() => router.push('/admin/routes')}
              className="flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline pt-1"
            >
              View Routes <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <PaceIndicator
            label="Empty Totes Delivered"
            current={stats.emptyTotesDelivered}
            target={stats.emptyTotesDeliveredTarget}
            elapsedPct={elapsedPct}
            amberPts={t.empty_totes_pace_amber_pts}
            redPts={t.empty_totes_pace_red_pts}
            linkLabel="View Routes"
            linkHref="/admin/routes"
          />
          <PaceIndicator
            label="Full Totes Delivered"
            current={stats.fullTotesDelivered}
            target={stats.fullTotesDeliveredTarget}
            elapsedPct={elapsedPct}
            amberPts={t.full_totes_pace_amber_pts}
            redPts={t.full_totes_pace_red_pts}
            linkLabel="View Routes"
            linkHref="/admin/routes"
          />
          <PaceIndicator
            label="Full Totes Picked Up"
            current={stats.fullTotesPickedUp}
            target={stats.fullTotesPickedUpTarget}
            elapsedPct={elapsedPct}
            amberPts={t.full_totes_pace_amber_pts}
            redPts={t.full_totes_pace_red_pts}
            linkLabel="View Routes"
            linkHref="/admin/routes"
          />
        </div>
      </section>
    </div>
  )
}
