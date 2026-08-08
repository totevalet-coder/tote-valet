'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RouteStop } from '@/types/database'
import { AlertTriangle, ClipboardList, Package, Boxes, ArrowRight, Shuffle } from 'lucide-react'

interface WHStats {
  storedTotal: number
  receivedToday: number
  expectedToday: number
  fullToday: number
  emptyToday: number
  stowedToday: number
  unstowed: number
  pendingPicks: number
  pickListsInProgress: number
  unsorted: number
  binSpacesAvailable: number
  driverErrors: number
  userRole: string
}

export default function WarehouseDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<WHStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, role')
      .eq('auth_id', userData.user.id)
      .single()

    if (!customer || !['warehouse', 'sorter', 'admin'].includes(customer.role)) {
      router.push('/dashboard')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)

    // Totes stored
    const { data: totes } = await supabase
      .from('totes')
      .select('status, bin_location, last_scan_date')

    // Bins capacity
    const { data: bins } = await supabase.from('bins').select('capacity, current_count')

    // Pick lists pending
    const { data: pickLists } = await supabase
      .from('pick_lists')
      .select('id, status, bins')
      .neq('status', 'complete')

    // Driver errors unresolved
    const { data: errors } = await supabase
      .from('errors')
      .select('id')
      .eq('resolved', false)

    // Today's expected inbound = tote_ids on today's pickup-type route stops
    const { data: todaysRoutes } = await supabase.from('routes').select('stops').eq('date', today)
    const expectedToteIds = new Set<string>()
    for (const r of todaysRoutes ?? []) {
      const stops = r.stops as RouteStop[]
      for (const s of stops) {
        if (s.type === 'pickup') s.tote_ids.forEach(id => expectedToteIds.add(id))
      }
    }
    let receivedToday = 0, fullToday = 0, emptyToday = 0
    if (expectedToteIds.size > 0) {
      const { data: expectedTotes } = await supabase
        .from('totes')
        .select('id, status, items')
        .in('id', [...expectedToteIds])
      for (const t of expectedTotes ?? []) {
        if (t.status !== 'in_transit') receivedToday++
        if ((t.items?.length ?? 0) > 0) fullToday++
        else emptyToday++
      }
    }

    const storedTotal = totes?.filter(t => t.status === 'stored').length ?? 0
    const unstowed = totes?.filter(t => t.status === 'ready_to_stow').length ?? 0
    const unsorted = totes?.filter(t => t.status === 'picked').length ?? 0
    const stowedToday = totes?.filter(t =>
      t.status === 'stored' && t.last_scan_date && new Date(t.last_scan_date) >= startOfToday
    ).length ?? 0

    // Count pending totes in pick lists (used for the "totes needed" alert banner)
    let pendingPicks = 0
    for (const pl of pickLists ?? []) {
      const binsArr = pl.bins as { totes: { status: string }[] }[]
      for (const b of binsArr) {
        pendingPicks += b.totes.filter(t => t.status === 'pending').length
      }
    }
    const pickListsInProgress = pickLists?.filter(pl => pl.status === 'in_progress').length ?? 0

    const totalCapacity = bins?.reduce((s, b) => s + b.capacity, 0) ?? 0
    const totalUsed = bins?.reduce((s, b) => s + b.current_count, 0) ?? 0
    const binSpacesAvailable = totalCapacity - totalUsed

    setStats({
      storedTotal,
      receivedToday,
      expectedToday: expectedToteIds.size,
      fullToday,
      emptyToday,
      stowedToday,
      unstowed,
      pendingPicks,
      pickListsInProgress,
      unsorted,
      binSpacesAvailable,
      driverErrors: errors?.length ?? 0,
      userRole: customer.role,
    })
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadStats() }, [loadStats])

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Alert Banners */}
      <div className="space-y-2">
        {stats.unstowed > 0 && (
          <button
            onClick={() => router.push('/warehouse/scan-store?tab=unstowed')}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{stats.unstowed} Tote{stats.unstowed !== 1 ? 's' : ''} Unstowed</p>
              <p className="text-xs text-amber-600">Need bin assignment — tap to view</p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-500" />
          </button>
        )}

        {stats.unsorted > 0 && (
          <button
            onClick={() => router.push('/warehouse/sort')}
            className="w-full flex items-center gap-3 bg-purple-50 border border-purple-300 rounded-2xl px-4 py-3 text-left hover:bg-purple-100 transition-colors"
          >
            <Shuffle className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-purple-800">{stats.unsorted} Tote{stats.unsorted !== 1 ? 's' : ''} Waiting to Be Sorted</p>
              <p className="text-xs text-purple-600">Picked, not yet routed to a zone — tap to view</p>
            </div>
            <ArrowRight className="w-4 h-4 text-purple-500" />
          </button>
        )}

        {stats.pendingPicks > 0 && (
          <button
            onClick={() => router.push('/warehouse/pick-lists')}
            className="w-full flex items-center gap-3 bg-blue-50 border border-blue-300 rounded-2xl px-4 py-3 text-left hover:bg-blue-100 transition-colors"
          >
            <ClipboardList className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-800">{stats.pendingPicks} Pending Pick{stats.pendingPicks !== 1 ? 's' : ''}</p>
              <p className="text-xs text-blue-600">Totes needed for customer returns — tap to view</p>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-500" />
          </button>
        )}

        {stats.driverErrors > 0 && stats.userRole === 'admin' && (
          <button
            onClick={() => router.push('/warehouse/reports?tab=errors')}
            className="w-full flex items-center gap-3 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 text-left hover:bg-red-100 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">{stats.driverErrors} Unresolved Driver Error{stats.driverErrors !== 1 ? 's' : ''}</p>
              <p className="text-xs text-red-600">Requires admin review — tap to view</p>
            </div>
            <ArrowRight className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Live Inventory</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="card text-center py-4">
            <span className="text-2xl">🏢</span>
            <p className="font-black text-3xl mt-1 text-brand-blue">{stats.storedTotal}</p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">Stored in Warehouse</p>
          </div>
          <div className="card text-center py-4">
            <span className="text-2xl">🚐</span>
            <p className="font-black text-3xl mt-1 text-yellow-600">
              {stats.receivedToday}
              {stats.expectedToday > 0 && <span className="text-gray-400 text-lg font-semibold">/{stats.expectedToday}</span>}
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">
              {stats.expectedToday > 0 ? 'Received Today' : 'No Pickups Scheduled'}
            </p>
            {stats.expectedToday > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">{stats.fullToday} full · {stats.emptyToday} empty</p>
            )}
          </div>
          <div className="card text-center py-4">
            <span className="text-2xl">⚠️</span>
            <p className="font-black text-3xl mt-1 text-amber-600">{stats.unstowed}</p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">Unstowed — Need Bin</p>
          </div>
          <div className="card text-center py-4">
            <span className="text-2xl">✅</span>
            <p className="font-black text-3xl mt-1 text-green-600">{stats.stowedToday}</p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">Stowed Today</p>
          </div>
          <div className="card text-center py-4">
            <span className="text-2xl">📋</span>
            <p className="font-black text-3xl mt-1 text-blue-600">{stats.pickListsInProgress}</p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">Pick Lists In Progress</p>
          </div>
          <div className="card text-center py-4">
            <span className="text-2xl">🔀</span>
            <p className="font-black text-3xl mt-1 text-purple-600">{stats.unsorted}</p>
            <p className="text-xs text-gray-500 mt-1 leading-tight">Unsorted — In Drop Zone</p>
          </div>
        </div>

        {/* Bin spaces — full width */}
        <div className="card mt-3 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Boxes className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="font-black text-2xl text-green-600">{stats.binSpacesAvailable}</p>
            <p className="text-xs text-gray-500">Bin Spaces Available</p>
          </div>
          <button
            onClick={() => router.push('/warehouse/reports?tab=bins')}
            className="ml-auto flex items-center gap-1 text-xs text-brand-blue font-semibold hover:underline"
          >
            View Bins <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Actions</h2>
        <button
          onClick={() => router.push('/warehouse/scan-store')}
          className="w-full flex items-center gap-4 bg-brand-navy text-white rounded-2xl px-5 py-4 shadow-lg hover:bg-blue-900 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="font-black text-sm">Receive & Stow Totes</p>
            <p className="text-white/60 text-xs mt-0.5">Scan tote then scan bin</p>
          </div>
        </button>
        <button
          onClick={() => router.push('/warehouse/pick-lists')}
          className="w-full flex items-center gap-4 bg-white border-2 border-brand-blue text-brand-navy rounded-2xl px-5 py-4 shadow-sm hover:bg-blue-50 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-brand-blue" />
          </div>
          <div className="text-left">
            <p className="font-black text-sm">Pick Lists</p>
            <p className="text-gray-400 text-xs mt-0.5">Start or continue picking</p>
          </div>
        </button>
        <button
          onClick={() => router.push('/warehouse/sort')}
          className="w-full flex items-center gap-4 bg-white border-2 border-purple-300 text-brand-navy rounded-2xl px-5 py-4 shadow-sm hover:bg-purple-50 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shuffle className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-left">
            <p className="font-black text-sm">Sort</p>
            <p className="text-gray-400 text-xs mt-0.5">Route picked totes to zones</p>
          </div>
        </button>
      </section>
    </div>
  )
}
