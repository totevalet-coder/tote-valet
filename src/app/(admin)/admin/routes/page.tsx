'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { Plus, ChevronRight, Clock, CheckCircle2, Truck, Navigation } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  planned:    'bg-gray-100 text-gray-600',
  in_progress:'bg-blue-100 text-blue-700',
  returning:  'bg-orange-100 text-orange-700',
  complete:   'bg-green-100 text-green-700',
}

export default function AdminRoutesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [routes, setRoutes] = useState<(Route & { driverName: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('routes').select('*').order('date', { ascending: false }).limit(50)
    if (filter === 'active') q = q.neq('status', 'complete')

    const { data: routeData } = await q
    if (!routeData) { setLoading(false); return }

    const enriched = await Promise.all((routeData as Route[]).map(async r => {
      const { data: driver } = await supabase.from('customers').select('name').eq('id', r.driver_id ?? '').single()
      return { ...r, driverName: driver?.name ?? 'Unassigned' }
    }))

    setRoutes(enriched)
    setLoading(false)
  }, [supabase, filter])

  useEffect(() => { load() }, [load])

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Routes</h1>
        <button
          onClick={() => router.push('/admin/routes/new')}
          className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-3 py-2 text-sm font-bold hover:bg-blue-900 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Route
        </button>
      </div>

      {/* Filter toggle */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {(['active', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${filter === f ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500'}`}
          >
            {f === 'active' ? 'Active' : 'All Routes'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
        </div>
      ) : routes.length === 0 ? (
        <div className="text-center py-16">
          <Navigation className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No routes found</p>
          <p className="text-gray-400 text-sm mt-1">Tap New Route to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(r => {
            const stops = r.stops as RouteStop[]
            const completed = stops.filter(s => s.completed).length
            return (
              <button
                key={r.id}
                onClick={() => router.push(`/admin/routes/${r.id}`)}
                className="w-full card text-left flex items-center gap-4"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  r.status === 'complete' ? 'bg-green-100' :
                  r.status === 'in_progress' || r.status === 'returning' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  {r.status === 'complete' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                   r.status === 'in_progress' || r.status === 'returning' ? <Truck className="w-5 h-5 text-blue-600" /> :
                   <Clock className="w-5 h-5 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-brand-navy">{r.id}</span>
                    <span className={`status-pill text-xs ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{r.driverName} · {r.date}</p>
                  <p className="text-xs text-gray-400">{completed}/{stops.length} stops complete · {stops.reduce((n, s) => n + s.tote_ids.length, 0)} totes</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
