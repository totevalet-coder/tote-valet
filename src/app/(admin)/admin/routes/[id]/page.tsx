'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop, Customer } from '@/types/database'
import {
  ChevronLeft, CheckCircle2, Package, MapPin, AlertCircle, Clock, Truck,
  UserCog, Split, X, AlertTriangle,
} from 'lucide-react'

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
  const [driverEmail, setDriverEmail] = useState('')
  const [drivers, setDrivers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  // Edit driver
  const [editingDriver, setEditingDriver] = useState(false)
  const [newDriverId, setNewDriverId] = useState('')
  const [savingDriver, setSavingDriver] = useState(false)

  // Split route
  const [splitting, setSplitting] = useState(false)
  const [splitSelected, setSplitSelected] = useState<Set<number>>(new Set())
  const [splitDriverId, setSplitDriverId] = useState('')
  const [splitError, setSplitError] = useState('')
  const [splitSaving, setSplitSaving] = useState(false)
  const [splitResultId, setSplitResultId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [routeRes, driversRes] = await Promise.all([
      supabase.from('routes').select('*').eq('id', id).single(),
      supabase.from('customers').select('*').eq('role', 'driver').order('name'),
    ])
    const r = routeRes.data
    if (!r) { router.push('/admin/routes'); return }
    setRoute(r as Route)
    setDrivers((driversRes.data ?? []) as Customer[])
    if (r.driver_id) {
      const { data: d } = await supabase.from('customers').select('name, email').eq('id', r.driver_id).single()
      setDriverName(d?.name ?? 'Unknown')
      setDriverEmail(d?.email ?? '')
    } else {
      setDriverName('Unassigned')
      setDriverEmail('')
    }
    setLoading(false)
  }, [supabase, id, router])

  useEffect(() => { load() }, [load])

  async function saveReassign() {
    if (!route || !newDriverId) return
    setSavingDriver(true)
    await supabase.from('routes').update({ driver_id: newDriverId }).eq('id', route.id)
    setEditingDriver(false)
    setSavingDriver(false)
    load()
  }

  function toggleSplitStop(stopNumber: number) {
    setSplitSelected(prev => { const n = new Set(prev); n.has(stopNumber) ? n.delete(stopNumber) : n.add(stopNumber); return n })
  }

  async function commitSplit() {
    if (!route) return
    const stops = route.stops as RouteStop[]
    setSplitError('')

    if (splitSelected.size === 0) { setSplitError('Select at least one stop to move.'); return }
    if (splitSelected.size === stops.length) { setSplitError('Can\'t move every stop — use Edit Driver instead to reassign the whole route.'); return }
    if (!splitDriverId) { setSplitError('Select a driver for the split-off stops.'); return }

    setSplitSaving(true)

    const movedStops: RouteStop[] = stops
      .filter(s => splitSelected.has(s.stop_number))
      .map((s, i) => ({ ...s, stop_number: i + 1 }))
    const remainingStops: RouteStop[] = stops
      .filter(s => !splitSelected.has(s.stop_number))
      .map((s, i) => ({ ...s, stop_number: i + 1 }))

    // Same RT-### auto-increment pattern used on the New Route page
    const { data: latest } = await supabase.from('routes').select('id').order('created_at', { ascending: false }).limit(1)
    const lastNum = latest?.[0]?.id?.match(/\d+$/)?.[0]
    const nextNum = lastNum ? String(parseInt(lastNum) + 1).padStart(3, '0') : '001'
    const newRouteId = `RT-${nextNum}`

    const { error: insertError } = await supabase.from('routes').insert({
      id: newRouteId,
      driver_id: splitDriverId,
      date: route.date,
      status: 'planned',
      stops: movedStops,
      completed_at: null,
      force_complete_count: 0,
      error_count: 0,
    })
    if (insertError) { setSplitError(insertError.message); setSplitSaving(false); return }

    const { error: updateError } = await supabase.from('routes').update({ stops: remainingStops }).eq('id', route.id)
    if (updateError) { setSplitError(updateError.message); setSplitSaving(false); return }

    setSplitResultId(newRouteId)
    setSplitSaving(false)
    setSplitting(false)
    setSplitSelected(new Set())
    setSplitDriverId('')
    load()
  }

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
  const canEdit = route.status !== 'complete'

  return (
    <div className="p-6 space-y-5 max-w-3xl">
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
        <p className="text-white/70 text-sm mt-0.5">
          {driverName}{driverEmail && <span className="text-white/50"> · {driverEmail}</span>}
        </p>
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

      {/* Edit actions */}
      {canEdit && (
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingDriver(v => !v); setNewDriverId(route.driver_id ?? ''); setSplitting(false) }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold border-2 transition-colors ${
              editingDriver ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <UserCog className="w-4 h-4" /> Edit Driver
          </button>
          <button
            onClick={() => { setSplitting(v => !v); setEditingDriver(false); setSplitSelected(new Set()); setSplitError('') }}
            disabled={stops.length < 2}
            title={stops.length < 2 ? 'Need at least 2 stops to split' : undefined}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold border-2 transition-colors disabled:opacity-40 ${
              splitting ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Split className="w-4 h-4" /> Split Route
          </button>
        </div>
      )}

      {splitResultId && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-bold text-green-800 flex-1">Split into new route {splitResultId}</p>
          <button onClick={() => router.push(`/admin/routes/${splitResultId}`)} className="text-xs font-semibold text-green-700 hover:underline">
            View →
          </button>
        </div>
      )}

      {/* Edit driver panel */}
      {editingDriver && (
        <div className="card border-2 border-brand-navy/20 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reassign Driver</p>
          <select value={newDriverId} onChange={e => setNewDriverId(e.target.value)} className="input-field">
            <option value="">Select driver…</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name} — {d.email}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={saveReassign}
              disabled={!newDriverId || newDriverId === route.driver_id || savingDriver}
              className="flex-1 bg-brand-navy text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 hover:bg-blue-900 transition-colors"
            >
              {savingDriver ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditingDriver(false)} className="flex-1 border-2 border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-bold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Split route panel */}
      {splitting && (
        <div className="card border-2 border-purple-200 bg-purple-50/30 space-y-3">
          <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Split Route — select stops to move</p>
          <div className="space-y-1.5">
            {stops.map(s => (
              <label key={s.stop_number} className="flex items-center gap-2.5 bg-white rounded-xl px-3 py-2.5 border border-gray-200 cursor-pointer">
                <input type="checkbox" checked={splitSelected.has(s.stop_number)} onChange={() => toggleSplitStop(s.stop_number)} className="rounded" />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-brand-navy text-sm">{s.customer_name}</span>
                  <span className={`ml-2 status-pill text-[10px] ${s.type === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{s.type}</span>
                </span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">New driver for these stops</label>
            <select value={splitDriverId} onChange={e => setSplitDriverId(e.target.value)} className="input-field">
              <option value="">Select driver…</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.email}</option>
              ))}
            </select>
          </div>
          {splitError && (
            <div className="flex items-start gap-2 text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {splitError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={commitSplit}
              disabled={splitSaving}
              className="flex-1 bg-purple-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 hover:bg-purple-700 transition-colors"
            >
              {splitSaving ? 'Splitting…' : `Split ${splitSelected.size || ''} Stop${splitSelected.size !== 1 ? 's' : ''} to New Route`}
            </button>
            <button onClick={() => setSplitting(false)} className="px-4 border-2 border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    {stop.tote_ids.map(tid => (
                      <span key={tid} className="bg-gray-100 text-brand-navy text-xs font-mono font-semibold rounded-lg px-2 py-1 flex items-center gap-1">
                        <Package className="w-3 h-3 text-gray-400" />{tid}
                      </span>
                    ))}
                    {stop.expected_empty_count && stop.expected_empty_count > stop.tote_ids.length ? (
                      <span className="bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg px-2 py-1">
                        + {stop.expected_empty_count - stop.tote_ids.length} more empties (driver scans at load)
                      </span>
                    ) : null}
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
