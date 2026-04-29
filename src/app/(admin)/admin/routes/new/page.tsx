'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer, RouteStop } from '@/types/database'
import { ChevronLeft, Plus, X, Package, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface StopDraft {
  key: string
  customerId: string
  customerName: string
  address: string
  type: 'pickup' | 'delivery'
  toteInput: string
  toteIds: string[]
  notes: string
}

export default function NewRoutePage() {
  const router = useRouter()
  const supabase = createClient()

  // Route-level fields
  const [drivers, setDrivers] = useState<Customer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [routeId, setRouteId] = useState('')

  // Stop builder
  const [stops, setStops] = useState<StopDraft[]>([])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Add stop form state
  const [addingStop, setAddingStop] = useState(false)
  const [stopCustomerId, setStopCustomerId] = useState('')
  const [stopType, setStopType] = useState<'pickup' | 'delivery'>('pickup')
  const [stopNotes, setStopNotes] = useState('')
  const [stopToteInput, setStopToteInput] = useState('')
  const [stopToteIds, setStopToteIds] = useState<string[]>([])
  const [stopToteError, setStopToteError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    const { data: d } = await supabase.from('customers').select('*').eq('role', 'driver')
    const { data: c } = await supabase.from('customers').select('*').eq('role', 'customer').order('name')
    if (d) setDrivers(d as Customer[])
    if (c) setCustomers(c as Customer[])

    // Auto-generate route ID
    const { data: latest } = await supabase
      .from('routes')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
    const lastNum = latest?.[0]?.id?.match(/\d+$/)?.[0]
    const nextNum = lastNum ? String(parseInt(lastNum) + 1).padStart(3, '0') : '001'
    setRouteId(`RT-${nextNum}`)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const selectedCustomer = customers.find(c => c.id === stopCustomerId)

  function addToteToStop() {
    const val = stopToteInput.trim().toUpperCase()
    if (!val) return
    if (stopToteIds.includes(val)) { setStopToteError(`${val} already added.`); return }
    setStopToteIds(prev => [...prev, val])
    setStopToteInput('')
    setStopToteError('')
  }

  function commitStop() {
    if (!stopCustomerId) return
    if (stopToteIds.length === 0) { setStopToteError('Add at least one tote ID.'); return }

    const cust = customers.find(c => c.id === stopCustomerId)!
    setStops(prev => [...prev, {
      key: crypto.randomUUID(),
      customerId: stopCustomerId,
      customerName: cust.name,
      address: cust.address ?? '',
      type: stopType,
      toteInput: '',
      toteIds: stopToteIds,
      notes: stopNotes,
    }])

    // Reset add-stop form
    setAddingStop(false)
    setStopCustomerId('')
    setStopType('pickup')
    setStopNotes('')
    setStopToteInput('')
    setStopToteIds([])
    setStopToteError('')
  }

  function removeStop(key: string) {
    setStops(prev => prev.filter(s => s.key !== key))
  }

  function removeToteFromStop(key: string, toteId: string) {
    setStops(prev => prev.map(s => s.key === key ? { ...s, toteIds: s.toteIds.filter(t => t !== toteId) } : s))
  }

  async function handleSave() {
    if (!driverId) { setSaveError('Select a driver.'); return }
    if (!routeId.trim()) { setSaveError('Route ID is required.'); return }
    if (stops.length === 0) { setSaveError('Add at least one stop.'); return }
    setSaving(true)
    setSaveError('')

    const routeStops: RouteStop[] = stops.map((s, i) => ({
      stop_number: i + 1,
      customer_id: s.customerId,
      customer_name: s.customerName,
      address: s.address,
      type: s.type,
      tote_ids: s.toteIds,
      seal_numbers: [],
      notes: s.notes || undefined,
      completed: false,
      force_completed: false,
    }))

    const { error } = await supabase.from('routes').insert({
      id: routeId.trim().toUpperCase(),
      driver_id: driverId,
      date,
      status: 'planned',
      stops: routeStops,
      completed_at: null,
      force_complete_count: 0,
      error_count: 0,
    })

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    router.push('/admin/routes')
  }

  const canSave = driverId && stops.length > 0 && routeId.trim()

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/admin/routes')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Routes
      </button>

      <h1 className="font-black text-2xl text-brand-navy">New Route</h1>

      {/* Route details */}
      <div className="card space-y-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Route Details</h2>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Route ID</label>
          <input
            type="text"
            value={routeId}
            onChange={e => setRouteId(e.target.value.toUpperCase())}
            className="input-field font-mono"
            placeholder="e.g. RT-004"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Driver</label>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className="input-field">
            <option value="">Select driver…</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Stops list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Stops ({stops.length})
          </h2>
        </div>

        {stops.length === 0 && !addingStop && (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl px-5 py-8 text-center">
            <p className="text-gray-400 font-semibold text-sm">No stops yet</p>
            <p className="text-gray-400 text-xs mt-1">Add stops below</p>
          </div>
        )}

        <div className="space-y-2">
          {stops.map((stop, idx) => {
            const isExpanded = expandedKey === stop.key
            return (
              <div key={stop.key} className="card space-y-0">
                <button
                  onClick={() => setExpandedKey(isExpanded ? null : stop.key)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm ${
                    stop.type === 'pickup' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy text-sm">{stop.customerName}</p>
                    <p className="text-xs text-gray-400 truncate">{stop.address}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`status-pill text-[10px] ${stop.type === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {stop.type}
                      </span>
                      <span className="text-xs text-gray-400">{stop.toteIds.length} tote{stop.toteIds.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    <div className="space-y-1.5">
                      {stop.toteIds.map(tid => (
                        <div key={tid} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm font-mono font-semibold text-brand-navy flex-1">{tid}</span>
                          <button onClick={() => removeToteFromStop(stop.key, tid)}>
                            <X className="w-3.5 h-3.5 text-gray-300 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {stop.notes && (
                      <p className="text-xs text-gray-500 bg-yellow-50 rounded-xl px-3 py-2">{stop.notes}</p>
                    )}
                    <button
                      onClick={() => removeStop(stop.key)}
                      className="w-full text-center text-xs text-red-500 hover:text-red-700 font-semibold"
                    >
                      Remove Stop
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Add stop form */}
      {addingStop ? (
        <div className="card border-2 border-brand-blue/30 bg-brand-blue/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-brand-navy">Stop {stops.length + 1}</h3>
            <button onClick={() => { setAddingStop(false); setStopToteIds([]); setStopToteInput(''); setStopToteError('') }}>
              <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer</label>
            <select value={stopCustomerId} onChange={e => setStopCustomerId(e.target.value)} className="input-field">
              <option value="">Select customer…</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedCustomer?.address && (
              <p className="text-xs text-gray-400 mt-1 px-1">{selectedCustomer.address}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Stop Type</label>
            <div className="flex gap-2">
              {(['pickup', 'delivery'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setStopType(t)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-colors ${
                    stopType === t
                      ? t === 'pickup' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-brand-blue bg-blue-50 text-brand-blue'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tote IDs <span className="text-gray-400 font-normal">({stopToteIds.length} added)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={stopToteInput}
                onChange={e => { setStopToteInput(e.target.value.toUpperCase()); setStopToteError('') }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToteToStop() } }}
                placeholder="e.g. TV-1001"
                className="input-field flex-1 font-mono text-sm"
              />
              <button
                onClick={addToteToStop}
                disabled={!stopToteInput.trim()}
                className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {stopToteError && <p className="text-xs text-red-600 mt-1">{stopToteError}</p>}

            {stopToteIds.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {stopToteIds.map(tid => (
                  <div key={tid} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-200">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-mono font-semibold text-brand-navy flex-1">{tid}</span>
                    <button onClick={() => setStopToteIds(prev => prev.filter(t => t !== tid))}>
                      <X className="w-3.5 h-3.5 text-gray-300 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={stopNotes}
              onChange={e => setStopNotes(e.target.value)}
              placeholder="e.g. Leave at back door"
              className="input-field text-sm"
            />
          </div>

          <button
            onClick={commitStop}
            disabled={!stopCustomerId || stopToteIds.length === 0}
            className="w-full bg-brand-navy text-white rounded-xl py-3 font-bold text-sm disabled:opacity-40 hover:bg-blue-900 transition-colors"
          >
            Add Stop to Route
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingStop(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-blue/40 text-brand-blue rounded-2xl py-4 font-semibold text-sm hover:bg-brand-blue/5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Stop
        </button>
      )}

      {/* Save */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave || saving || addingStop}
        className="w-full bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg disabled:opacity-40"
      >
        {saving ? 'Creating Route…' : `Create Route ${routeId}`}
      </button>
    </div>
  )
}
