'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RouteStop } from '@/types/database'
import { Truck, Package, CheckCircle2, Warehouse, ArrowRight } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import { todayStr } from '@/lib/date'

interface InboundStats {
  receivedToday: number
  expectedToday: number
  fullToday: number
  emptyToday: number
  atStation: number
  stowedToday: number
  storedTotal: number
}

export default function InboundPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<InboundStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = todayStr()
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)

    const [totesRes, todaysRoutesRes] = await Promise.all([
      supabase.from('totes').select('id, status, items, last_scan_date'),
      supabase.from('routes').select('stops').eq('date', today),
    ])

    const totes = totesRes.data ?? []
    const toteById = new Map(totes.map(t => [t.id, t]))

    const expectedToteIds = new Set<string>()
    for (const r of todaysRoutesRes.data ?? []) {
      const stops = r.stops as RouteStop[]
      for (const s of stops) if (s.type === 'pickup') s.tote_ids.forEach(id => expectedToteIds.add(id))
    }
    let receivedToday = 0, fullToday = 0, emptyToday = 0
    for (const id of expectedToteIds) {
      const t = toteById.get(id)
      if (!t) continue
      if (t.status !== 'in_transit') receivedToday++
      if ((t.items?.length ?? 0) > 0) fullToday++
      else emptyToday++
    }

    const atStation = totes.filter(t => t.status === 'ready_to_stow').length
    const stowedToday = totes.filter(t =>
      t.status === 'stored' && t.last_scan_date && new Date(t.last_scan_date) >= startOfToday
    ).length
    const storedTotal = totes.filter(t => t.status === 'stored').length

    setStats({ receivedToday, expectedToday: expectedToteIds.size, fullToday, emptyToday, atStation, stowedToday, storedTotal })
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  if (loading || !stats) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h1 className="font-black text-2xl text-brand-navy">Inbound</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Inbound Today"
          value={stats.receivedToday}
          total={stats.expectedToday || undefined}
          subtext={stats.expectedToday > 0 ? `${stats.fullToday} full · ${stats.emptyToday} empty` : 'No pickups scheduled'}
          icon={Truck}
        />
        <StatCard label="At Station" value={stats.atStation} subtext="Arrived, awaiting stow" icon={Package} valueColor="text-amber-600" />
        <StatCard label="Stowed Today" value={stats.stowedToday} subtext="Confirmed in bin" icon={CheckCircle2} valueColor="text-green-600" />
        <StatCard label="Total Stored" value={stats.storedTotal} subtext="All totes currently in bins" icon={Warehouse} />
      </div>

      <p className="text-xs text-gray-400 max-w-lg">
        Per-drop-zone and per-staff breakdowns from the original mockup aren't shown here — the app doesn't
        currently track which physical zone a tote is dropped in or which staff member is actively stowing it,
        only the tote's status. Worth adding if that level of floor detail becomes valuable.
      </p>

      <button
        onClick={() => router.push('/admin/routes')}
        className="flex items-center gap-2 card px-5 py-4 hover:shadow-md transition-shadow w-fit"
      >
        <div className="w-9 h-9 rounded-xl bg-brand-blue/10 flex items-center justify-center">
          <Truck className="w-4 h-4 text-brand-blue" />
        </div>
        <div className="text-left">
          <p className="text-sm font-bold text-brand-navy">View Inbound Manifest by Route</p>
          <p className="text-xs text-gray-400">Tote-level detail lives under Routes</p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-300 ml-2" />
      </button>
    </div>
  )
}
