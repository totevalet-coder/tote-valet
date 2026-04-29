'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { ChevronLeft, CheckCircle2, Package, MapPin, AlertCircle, Clock, Truck } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  planned:    'bg-gray-100 text-gray-600',
  in_progress:'bg-blue-100 text-blue-700',
  returning:  'bg-orange-100 text-orange-700',
  complete:   'bg-green-100 text-green-700',
}

export default function AdminRouteDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [route, setRoute] = useState<Route | null>(null)
  const [driverName, setDriverName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('routes').select('*').eq('id', id).single()
    if (!r) { router.push('/admin/routes'); return }
    setRoute(r as Route)
    if (r.driver_id) {
      const { data: d } = await supabase.from('customers').select('name').eq('id', r.driver_id).single()
      setDriverName(d?.name ?? 'Unknown')
    }
    setLoading(false)
  }, [supabase, id, router])

  useEffect(() => { load() }, [load])

  if (loading || !route) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const stops = route.stops as RouteStop[]
  const completed = stops.filter(s => s.completed).length
  const totalTotes = stops.reduce((n, s) => n + s.tote_ids.length, 0)

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/admin/routes')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Routes
      </button>

      {/* Header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/60 text-xs font-medium">{route.date}</p>
          <span className={`status-pill text-xs ${STATUS_STYLES[route.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {route.status.replace('_', ' ')}
          </span>
        </div>
        <h1 className="font-black text-2xl">{route.id}</h1>
        <p className="text-white/70 text-sm mt-0.5">{driverName}</p>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Stops', value: `${completed}/${stops.length}` },
            { label: 'Totes', value: totalTotes },
            { label: 'Errors', value: route.error_count ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <p className="font-black text-xl">{value}</p>
              <p className="text-white/60 text-[10px] font-medium">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stops */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Stops</h2>
        <div className="space-y-3">
          {stops.map(stop => (
            <div key={stop.stop_number} className={`card ${stop.completed ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm ${
                  stop.force_completed ? 'bg-red-100 text-red-600' :
                  stop.completed ? 'bg-green-100 text-green-600' :
                  stop.type === 'pickup' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {stop.force_completed ? '!' : stop.completed ? '✓' : stop.stop_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-brand-navy text-sm">{stop.customer_name}</span>
                    <span className={`status-pill text-[10px] ${stop.type === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {stop.type}
                    </span>
                    {stop.completed && !stop.force_completed && (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    )}
                    {stop.force_completed && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{stop.address}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stop.tote_ids.map(tid => (
                      <span key={tid} className="bg-gray-100 text-brand-navy text-xs font-mono font-semibold rounded-lg px-2 py-1 flex items-center gap-1">
                        <Package className="w-3 h-3 text-gray-400" />{tid}
                      </span>
                    ))}
                  </div>
                  {stop.notes && (
                    <p className="text-xs text-yellow-700 bg-yellow-50 rounded-xl px-3 py-1.5 mt-2">{stop.notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Status info */}
      {route.status === 'planned' && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-gray-400" />
          <p className="text-sm text-gray-500">Route not yet started. Driver must load truck first.</p>
        </div>
      )}
      {(route.status === 'in_progress' || route.status === 'returning') && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Truck className="w-5 h-5 text-blue-600" />
          <p className="text-sm text-blue-700 font-medium">
            {route.status === 'returning' ? 'Driver returning to warehouse to drop totes.' : `In progress — ${completed} of ${stops.length} stops done.`}
          </p>
        </div>
      )}
      {route.status === 'complete' && route.completed_at && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm text-green-700 font-medium">
            Completed at {new Date(route.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
