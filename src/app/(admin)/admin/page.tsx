'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RouteStop, PickListBin } from '@/types/database'
import {
  Package, ClipboardList, Boxes, Truck as TruckIcon,
  Loader2, CheckCircle2, ArrowRight,
} from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import PaceIndicator from '@/components/admin/PaceIndicator'

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
  const [generating, setGenerating] = useState(false)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }
    const { data: me } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    if (!me || me.role !== 'admin') { router.push('/dashboard'); return }

    const today = new Date().toISOString().split('T')[0]

    const [totesRes, binsRes, pickListsRes, driversRes, todaysRoutesRes] = await Promise.all([
      supabase.from('totes').select('id, status, items'),
      supabase.from('bins').select('capacity, current_count'),
      supabase.from('pick_lists').select('id, bins').neq('status', 'complete'),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('role', 'driver').eq('status', 'active'),
      supabase.from('routes').select('id, stops').eq('date', today),
    ])

    const totes = totesRes.data ?? []
    const bins = binsRes.data ?? []
    const todaysRoutes = todaysRoutesRes.data ?? []

    // Bin capacity
    const binTotalCapacity = bins.reduce((s, b) => s + b.capacity, 0)
    const binUsed = bins.reduce((s, b) => s + b.current_count, 0)
    const binSpacesAvailable = binTotalCapacity - binUsed

    // Unstowed / Staged & Ready
    const unstowed = totes.filter(t => t.status === 'ready_to_stow').length
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

    setStats({
      receivedToday, expectedToday: expectedToteIds.size, fullToday, emptyToday,
      unstowed,
      openPickLists, openPickListTotes,
      stagedReady,
      binSpacesAvailable, binTotalCapacity,
      routesCreated, routesTarget,
      fullTotesPickedUp, fullTotesPickedUpTarget,
      emptyTotesDelivered, emptyTotesDeliveredTarget,
    })
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  async function generatePickList() {
    setGenerating(true)
    setGeneratedId(null)

    const { data: totes } = await supabase
      .from('totes').select('id, bin_location, customer_id').eq('status', 'pending_pick')

    if (!totes || totes.length === 0) {
      alert('No totes are currently pending pick.')
      setGenerating(false)
      return
    }

    const customerIds = [...new Set(totes.map(t => t.customer_id))]
    const { data: customers } = await supabase.from('customers').select('id, name').in('id', customerIds)
    const nameMap: Record<string, string> = {}
    ;(customers ?? []).forEach(c => { nameMap[c.id] = c.name })

    const binMap: Record<string, { tote_id: string; customer_name: string; status: 'pending' | 'picked' }[]> = {}
    for (const tote of totes) {
      const bin = tote.bin_location ?? 'UNASSIGNED'
      if (!binMap[bin]) binMap[bin] = []
      binMap[bin].push({ tote_id: tote.id, customer_name: nameMap[tote.customer_id] ?? '', status: 'pending' })
    }

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

    if (!error) { setGeneratedId(id); load() }
    setGenerating(false)
  }

  if (loading || !stats) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const elapsedPct = getShiftElapsedPct()

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <p className="text-xs text-gray-400 font-medium">{today}</p>
        <h1 className="font-black text-2xl text-brand-navy">Dashboard</h1>
      </div>

      {/* Top summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Inbound Today"
          value={stats.receivedToday}
          total={stats.expectedToday || undefined}
          subtext={stats.expectedToday > 0 ? `${stats.fullToday} full · ${stats.emptyToday} empty` : 'No pickups scheduled'}
          icon={TruckIcon}
        />
        <StatCard
          label="Unstowed"
          value={stats.unstowed}
          subtext="On the floor, awaiting a bin"
          icon={Package}
          valueColor="text-amber-600"
          linkLabel="View in Inventory"
          linkHref="/admin/totes"
        />
        <StatCard
          label="Open Pick Lists"
          value={stats.openPickLists}
          subtext={`${stats.openPickListTotes} totes across ${stats.openPickLists} list${stats.openPickLists !== 1 ? 's' : ''}`}
          icon={ClipboardList}
          valueColor="text-blue-600"
          linkLabel="View Picking Overview"
          linkHref="/admin/pick-lists"
        />
        <StatCard
          label="Staged & Ready"
          value={stats.stagedReady}
          subtext="Complete, ready for truck"
          icon={CheckCircle2}
          valueColor="text-green-600"
        />
        <StatCard
          label="Bin Capacity"
          value={stats.binSpacesAvailable}
          total={stats.binTotalCapacity}
          subtext="empty of total capacity"
          icon={Boxes}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Routes Today</p>
              {stats.routesCreated < stats.routesTarget && (
                <span className="status-pill text-[10px] font-bold bg-red-100 text-red-700">Needs Attention</span>
              )}
            </div>
            <p className="font-black text-2xl text-brand-navy">
              {stats.routesCreated}<span className="text-gray-300 text-lg font-bold"> / {stats.routesTarget}</span>
            </p>
            <p className="text-xs text-gray-400">
              {stats.routesTarget - stats.routesCreated > 0
                ? `${stats.routesTarget - stats.routesCreated} route${stats.routesTarget - stats.routesCreated !== 1 ? 's' : ''} still need to be created`
                : 'All active drivers have a route today'}
            </p>
          </div>
          <PaceIndicator
            label="Empty Totes Delivered"
            current={stats.emptyTotesDelivered}
            target={stats.emptyTotesDeliveredTarget}
            elapsedPct={elapsedPct}
          />
          <PaceIndicator
            label="Full Totes Picked Up"
            current={stats.fullTotesPickedUp}
            target={stats.fullTotesPickedUpTarget}
            elapsedPct={elapsedPct}
          />
        </div>
      </section>

      {/* Quick Actions — Generate Pick List stays here until the dedicated
          Pick page (Phase 4) exists to host it */}
      <section className="space-y-3 max-w-md">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Actions</h2>
        {generatedId && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-green-800">Pick List {generatedId} created</p>
              <p className="text-xs text-green-600">Warehouse can now start picking</p>
            </div>
            <button onClick={() => setGeneratedId(null)} className="text-green-400 text-lg leading-none">×</button>
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
          <div className="text-left flex-1">
            <p className="font-bold text-sm">{generating ? 'Generating…' : 'Generate Pick List'}</p>
            <p className="text-xs text-gray-400">Pulls all pending-pick totes from warehouse</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" />
        </button>
      </section>
    </div>
  )
}
