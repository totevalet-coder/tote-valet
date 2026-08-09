'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RouteStop } from '@/types/database'
import { Package, CheckCircle2, AlertTriangle, Shuffle } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import { todayStr } from '@/lib/date'

interface DropZoneRow {
  id: string
  customerName: string
  waitingSince: string | null
  routeId: string | null
  driverName: string | null
}

export default function AdminSortPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [dropZone, setDropZone] = useState<DropZoneRow[]>([])
  const [sortedToday, setSortedToday] = useState(0)

  const load = useCallback(async () => {
    const today = todayStr()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [totesRes, routesRes] = await Promise.all([
      supabase.from('totes').select('id, status, customer_id, last_scan_date'),
      supabase.from('routes').select('id, driver_id, stops').eq('date', today),
    ])

    const totes = totesRes.data ?? []
    const routes = routesRes.data ?? []
    const pickedTotes = totes.filter(t => t.status === 'picked')

    const customerIds = [...new Set(pickedTotes.map(t => t.customer_id))]
    const driverIds = [...new Set(routes.map(r => r.driver_id).filter((v): v is string => !!v))]
    const [custRes, driverRes] = await Promise.all([
      customerIds.length > 0
        ? supabase.from('customers').select('id, name').in('id', customerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      driverIds.length > 0
        ? supabase.from('customers').select('id, name').in('id', driverIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const custNameMap: Record<string, string> = {}
    ;(custRes.data ?? []).forEach(c => { custNameMap[c.id] = c.name })
    const driverNameMap: Record<string, string> = {}
    ;(driverRes.data ?? []).forEach(d => { driverNameMap[d.id] = d.name })

    // Same lookup Sort's own working page (/warehouse/sort) does at scan
    // time — surfaced here proactively so admin can see which drop-zone
    // totes already have a route to go to, and flag the ones that don't
    // before a warehouse worker hits "no route found" on the floor.
    const rows: DropZoneRow[] = pickedTotes.map(t => {
      let routeId: string | null = null
      let driverName: string | null = null
      for (const r of routes) {
        const stops = r.stops as RouteStop[]
        if (stops.some(s => s.tote_ids.includes(t.id))) {
          routeId = r.id
          driverName = r.driver_id ? (driverNameMap[r.driver_id] ?? 'Unassigned') : 'Unassigned'
          break
        }
      }
      return {
        id: t.id,
        customerName: custNameMap[t.customer_id] ?? 'Unknown',
        waitingSince: t.last_scan_date,
        routeId,
        driverName,
      }
    }).sort((a, b) => (a.waitingSince ?? '').localeCompare(b.waitingSince ?? ''))

    const sorted = totes.filter(t =>
      t.status === 'returned_to_station' && t.last_scan_date && new Date(t.last_scan_date) >= startOfToday
    ).length

    setDropZone(rows)
    setSortedToday(sorted)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const noRouteCount = dropZone.filter(r => !r.routeId).length

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h1 className="font-black text-2xl text-brand-navy">Sort</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="In Drop Zone" value={dropZone.length} subtext="Picked, awaiting sort" icon={Package} valueColor="text-amber-600" />
        <StatCard
          label="Sorted Today" value={sortedToday} subtext="Routed to a staging zone" icon={CheckCircle2} valueColor="text-green-600"
          linkLabel="View in Inventory" linkHref="/admin/totes?status=returned_to_station"
        />
        <StatCard
          label="No Route Match"
          value={noRouteCount}
          subtext={noRouteCount > 0 ? 'Needs a route before it can be sorted' : 'All drop-zone totes have a route'}
          icon={AlertTriangle}
          valueColor={noRouteCount > 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Drop Zone — Awaiting Sort ({dropZone.length})
        </h2>
        {dropZone.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-bold text-gray-400 text-lg">Drop zone is empty</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Tote</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Customer</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Destination Route</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {dropZone.map(row => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-brand-navy">{row.id}</td>
                      <td className="px-4 py-3 text-gray-600">{row.customerName}</td>
                      <td className="px-4 py-3">
                        {row.routeId ? (
                          <button onClick={() => router.push(`/admin/routes/${row.routeId}`)} className="text-brand-blue font-semibold hover:underline">
                            {row.routeId}
                          </button>
                        ) : (
                          <span className="status-pill text-[10px] bg-red-100 text-red-700">No route today</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.driverName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <button onClick={() => router.push('/warehouse/sort')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
        <Shuffle className="w-3.5 h-3.5" /> Warehouse's working view (scan-to-sort) lives at /warehouse/sort →
      </button>
    </div>
  )
}
