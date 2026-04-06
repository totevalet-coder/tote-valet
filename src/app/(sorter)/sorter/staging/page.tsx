'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { CheckCircle2, Clock, Package, ChevronRight, Truck } from 'lucide-react'

interface ZoneInfo {
  routeId: string
  driverName: string
  date: string
  totalTotes: number
  stagedTotes: number
  totes: { id: string; customerName: string; staged: boolean }[]
}

export default function StagingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const loadZones = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data: routes } = await supabase
      .from('routes')
      .select('*')
      .eq('date', today)
      .neq('status', 'complete')
      .order('id')

    if (!routes) { setLoading(false); return }

    const zoneList: ZoneInfo[] = []

    for (const r of routes as Route[]) {
      const { data: driver } = await supabase.from('customers').select('name').eq('id', r.driver_id ?? '').single()
      const stops = r.stops as RouteStop[]

      // Collect all tote IDs for this route
      const allToteIds: string[] = []
      for (const stop of stops) {
        allToteIds.push(...stop.tote_ids)
      }

      if (allToteIds.length === 0) continue

      // Check which totes are staged (returned_to_station)
      const { data: totes } = await supabase
        .from('totes')
        .select('id, status, customer_id')
        .in('id', allToteIds)

      const enriched = await Promise.all((totes ?? []).map(async t => {
        const { data: cust } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
        return {
          id: t.id,
          customerName: cust?.name ?? 'Unknown',
          staged: t.status === 'returned_to_station',
        }
      }))

      zoneList.push({
        routeId: r.id,
        driverName: driver?.name ?? 'Unassigned',
        date: r.date,
        totalTotes: allToteIds.length,
        stagedTotes: enriched.filter(t => t.staged).length,
        totes: enriched,
      })
    }

    setZones(zoneList)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadZones() }, [loadZones])

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Route Staging Zones</h1>
      <p className="text-sm text-gray-500 -mt-3">Today&apos;s routes and their staging progress.</p>

      {zones.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No Routes Today</p>
          <p className="text-gray-400 text-sm mt-1">Routes will appear here once assigned.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map(zone => {
            const pct = zone.totalTotes > 0 ? Math.round((zone.stagedTotes / zone.totalTotes) * 100) : 0
            const fullyStaged = zone.stagedTotes === zone.totalTotes
            const isExpanded = expanded === zone.routeId

            return (
              <div key={zone.routeId} className="card space-y-3">
                {/* Header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : zone.routeId)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    fullyStaged ? 'bg-green-100' : 'bg-brand-blue/10'
                  }`}>
                    {fullyStaged
                      ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : <Package className="w-5 h-5 text-brand-blue" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-navy text-sm">Zone {zone.routeId}</span>
                      {fullyStaged && (
                        <span className="status-pill bg-green-100 text-green-700 text-xs">Ready to Load</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{zone.driverName}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{zone.stagedTotes} / {zone.totalTotes} staged</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${fullyStaged ? 'bg-green-500' : 'bg-brand-blue'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Expanded tote list */}
                {isExpanded && (
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    {zone.totes.map(t => (
                      <div key={t.id} className={`flex items-center gap-3 ${!t.staged ? 'opacity-60' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          t.staged ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {t.staged
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            : <Package className="w-3.5 h-3.5 text-gray-400" />
                          }
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-mono font-bold text-brand-navy">{t.id}</span>
                          <span className="text-xs text-gray-400 ml-2">{t.customerName}</span>
                        </div>
                        <span className={`status-pill text-xs ${t.staged ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.staged ? 'Staged' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Load verification button */}
                {fullyStaged && (
                  <button
                    onClick={() => router.push(`/sorter/load/${zone.routeId}`)}
                    className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-xl py-3 font-bold text-sm hover:bg-blue-900 transition-colors"
                  >
                    <Truck className="w-4 h-4" />
                    Driver Load Verification
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
