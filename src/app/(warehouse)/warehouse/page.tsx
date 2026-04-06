'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, ClipboardList, Package, Boxes, ArrowRight } from 'lucide-react'

interface WHStats {
  storedTotal: number
  inboundToday: number
  unstowed: number
  pendingPicks: number
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

    // Totes stored
    const { data: totes } = await supabase
      .from('totes')
      .select('status, bin_location')

    // Bins capacity
    const { data: bins } = await supabase.from('bins').select('capacity, current_count')

    // Pick lists pending
    const { data: pickLists } = await supabase
      .from('pick_lists')
      .select('id, bins')
      .neq('status', 'complete')

    // Driver errors unresolved
    const { data: errors } = await supabase
      .from('errors')
      .select('id')
      .eq('resolved', false)

    const storedTotal = totes?.filter(t => t.status === 'stored').length ?? 0
    const inboundToday = totes?.filter(t => t.status === 'in_transit').length ?? 0
    const unstowed = totes?.filter(t => t.status === 'ready_to_stow').length ?? 0

    // Count pending totes in pick lists
    let pendingPicks = 0
    for (const pl of pickLists ?? []) {
      const binsArr = pl.bins as { totes: { status: string }[] }[]
      for (const b of binsArr) {
        pendingPicks += b.totes.filter(t => t.status === 'pending').length
      }
    }

    const totalCapacity = bins?.reduce((s, b) => s + b.capacity, 0) ?? 0
    const totalUsed = bins?.reduce((s, b) => s + b.current_count, 0) ?? 0
    const binSpacesAvailable = totalCapacity - totalUsed

    setStats({
      storedTotal,
      inboundToday,
      unstowed,
      pendingPicks,
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
          {[
            { label: 'Stored in Warehouse', value: stats.storedTotal, emoji: '🏢', color: 'text-brand-blue' },
            { label: 'Full Totes Inbound', value: stats.inboundToday, emoji: '🚐', color: 'text-yellow-600' },
            { label: 'Unstowed — Need Bin', value: stats.unstowed, emoji: '⚠️', color: 'text-amber-600' },
            { label: 'Pending Picks', value: stats.pendingPicks, emoji: '📋', color: 'text-blue-600' },
          ].map(({ label, value, emoji, color }) => (
            <div key={label} className="card text-center py-4">
              <span className="text-2xl">{emoji}</span>
              <p className={`font-black text-3xl mt-1 ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">{label}</p>
            </div>
          ))}
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
            View Map <ArrowRight className="w-3 h-3" />
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
      </section>
    </div>
  )
}
