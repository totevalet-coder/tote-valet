'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import {
  MapPin, CheckCircle2, AlertTriangle, Package,
  ChevronLeft, ArrowRight, AlertCircle, X
} from 'lucide-react'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'

type ScanPhase = 'tote' | 'seal'
type ToteVerifyState = 'pending' | 'verified' | 'mismatch_1' | 'error'

interface ToteState {
  toteId: string
  sealNumber: string | null
  state: ToteVerifyState
  scannedSeal?: string
}

const FORCE_COMPLETE_CODES = [
  { code: 'FC-001', label: 'Scanner hardware failure' },
  { code: 'FC-002', label: 'Tote barcode unreadable/damaged' },
  { code: 'FC-003', label: 'Seal barcode unreadable/damaged' },
  { code: 'FC-004', label: 'App connectivity issue' },
  { code: 'FC-005', label: 'Customer present, totes handed over directly' },
  { code: 'FC-006', label: 'Time-critical situation, supervisor approved' },
  { code: 'FC-007', label: 'Other — see notes' },
]

export default function StopDetailPage() {
  const router = useRouter()
  const params = useParams()
  const routeId = params.routeId as string
  const stopNum = parseInt(params.stopNum as string, 10)
  const supabase = createClient()
  const [route, setRoute] = useState<Route | null>(null)
  const [stop, setStop] = useState<RouteStop | null>(null)
  const [driverId, setDriverId] = useState('')
  const [loading, setLoading] = useState(true)

  // Scan workflow state
  const [scanning, setScanning] = useState(false)
  const [scanPhase, setScanPhase] = useState<ScanPhase>('tote')
  const [currentToteIdx, setCurrentToteIdx] = useState(0)
  const [toteStates, setToteStates] = useState<ToteState[]>([])
  const [scanError, setScanError] = useState('')

  // Force complete state
  const [showForceComplete, setShowForceComplete] = useState(false)
  const [forceCode, setForceCode] = useState('')
  const [forceNotes, setForceNotes] = useState('')
  const [forceSaving, setForceSaving] = useState(false)

  // Partial delivery state
  const [showPartial, setShowPartial] = useState(false)
  const [partialNotes, setPartialNotes] = useState('')
  const [partialReason, setPartialReason] = useState('')

  // Success state
  const [showSuccess, setShowSuccess] = useState(false)
  const [nextStop, setNextStop] = useState<RouteStop | null>(null)

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_id', userData.user.id)
      .single()
    if (!customer) return
    setDriverId(customer.id)

    const { data: routeData } = await supabase
      .from('routes')
      .select('*')
      .eq('id', routeId)
      .single()

    if (!routeData) { router.push('/driver'); return }

    const r = routeData as Route
    setRoute(r)
    const s = (r.stops as RouteStop[]).find(s => s.stop_number === stopNum)
    if (!s) { router.push('/driver'); return }
    setStop(s)

    // Init tote states
    setToteStates(s.tote_ids.map((toteId, i) => ({
      toteId,
      sealNumber: s.seal_numbers?.[i] ?? null,
      state: 'pending',
    })))

    setLoading(false)
  }, [supabase, router, routeId, stopNum])

  useEffect(() => { loadData() }, [loadData])

  function openMaps() {
    if (!stop) return
    const encoded = encodeURIComponent(stop.address)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank')
  }

  function startScanning() {
    setScanning(true)
    setScanPhase('tote')
    setCurrentToteIdx(0)
  }

  function handleScan(val: string) {
    if (!stop) return
    setScanError('')

    const currentTote = toteStates[currentToteIdx]

    if (scanPhase === 'tote') {
      if (val !== currentTote.toteId) {
        setScanError(`Expected ${currentTote.toteId} — scanned ${val}. Try again.`)
        setScanValue('')
        return
      }
      // Tote matched — now scan seal if it has one
      if (currentTote.sealNumber) {
        setScanPhase('seal')
      } else {
        // No seal, mark verified and move on
        markVerified(currentToteIdx)
      }
    } else {
      // Seal phase
      if (val === currentTote.sealNumber) {
        markVerified(currentToteIdx)
      } else {
        if (currentTote.state === 'pending') {
          // First mismatch — warn and let rescan
          setToteStates(prev => prev.map((t, i) =>
            i === currentToteIdx ? { ...t, state: 'mismatch_1', scannedSeal: val } : t
          ))
          setScanError(`Seal mismatch! Expected ${currentTote.sealNumber}, got ${val}. Scan seal again to confirm.`)
        } else {
          // Second mismatch — flag as error
          const newStates = toteStates.map((t, i) =>
            i === currentToteIdx ? { ...t, state: 'error' as ToteVerifyState, scannedSeal: val } : t
          )
          setToteStates(newStates)
          void flagSealMismatch(currentTote.toteId, currentTote.sealNumber, val)
          setScanError(`Seal mismatch confirmed. Tote flagged for admin review.`)
          advanceToNextTote(newStates, currentToteIdx)
        }
      }
    }
  }

  function markVerified(idx: number) {
    const newStates = toteStates.map((t, i) => i === idx ? { ...t, state: 'verified' as ToteVerifyState } : t)
    setToteStates(newStates)
    advanceToNextTote(newStates, idx)
  }

  function advanceToNextTote(states: ToteState[], completedIdx: number) {
    const next = completedIdx + 1
    if (next < states.length) {
      setCurrentToteIdx(next)
      setScanPhase('tote')
      setScanError('')
    } else {
      // All totes processed — check with fresh states
      const allDone = states.every(t => t.state === 'verified' || t.state === 'error')
      if (allDone) {
        void completeStop(states)
      }
    }
  }

  async function flagSealMismatch(toteId: string, expected: string | null, scanned: string) {
    const errId = `ERR-${Math.floor(10000 + Math.random() * 90000)}`
    await supabase.from('errors').insert({
      id: errId,
      type: 'seal_mismatch',
      driver_id: driverId,
      route_id: routeId,
      tote_id: toteId,
      stop_info: stop?.address ?? '',
      detail: `Expected seal ${expected ?? 'none'}, scanned ${scanned}`,
      resolved: false,
    })
    await supabase.from('totes').update({ status: 'error' }).eq('id', toteId)
  }

  async function completeStop(states?: ToteState[]) {
    if (!route || !stop) return
    const finalStates = states ?? toteStates

    // Re-fetch route from DB to get the latest stop completion state
    const { data: freshRoute } = await supabase
      .from('routes')
      .select('*')
      .eq('id', routeId)
      .single()
    const currentRoute = (freshRoute as Route) ?? route

    const updatedStops = (currentRoute.stops as RouteStop[]).map(s =>
      s.stop_number === stopNum ? { ...s, completed: true } : s
    )

    // Update tote statuses
    const verifiedTotes = finalStates.filter(t => t.state === 'verified')
    for (const t of verifiedTotes) {
      const newStatus = stop.type === 'pickup' ? 'in_transit' : 'empty_at_customer'
      await supabase.from('totes').update({
        status: newStatus,
        last_scan_date: new Date().toISOString(),
      }).eq('id', t.toteId)
    }

    // Update route stop
    const allDone = updatedStops.every(s => s.completed)
    await supabase.from('routes').update({
      stops: updatedStops,
      status: allDone ? 'complete' : 'in_progress',
    }).eq('id', routeId)

    // Find next stop
    const next = updatedStops.find(s => !s.completed)
    setNextStop(next ?? null)
    setScanning(false)
    setShowSuccess(true)
  }

  async function handleForceComplete() {
    if (!forceCode || !forceNotes.trim()) return
    setForceSaving(true)

    const errId = `FC-${Math.floor(10000 + Math.random() * 90000)}`
    await supabase.from('errors').insert({
      id: errId,
      type: 'force_complete',
      driver_id: driverId,
      route_id: routeId,
      tote_id: stop?.tote_ids[0] ?? null,
      stop_info: stop ? `${stop.customer_name} — ${stop.address}` : '',
      error_code: forceCode,
      driver_notes: forceNotes,
      resolved: false,
    })

    const updatedStops = (route!.stops as RouteStop[]).map(s =>
      s.stop_number === stopNum
        ? { ...s, completed: true, force_completed: true, error_id: errId }
        : s
    )
    await supabase.from('routes').update({
      stops: updatedStops,
      force_complete_count: (route!.force_complete_count ?? 0) + 1,
      error_count: (route!.error_count ?? 0) + 1,
    }).eq('id', routeId)

    const next = updatedStops.find(s => !s.completed)
    setNextStop(next ?? null)
    setShowForceComplete(false)
    setForceSaving(false)
    setShowSuccess(true)
  }

  const STATION_ADDRESS = '6582 Gun Club Rd, Coopersburg, PA 18036'

  function openMapsTo(address: string) {
    const encoded = encodeURIComponent(address)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank')
  }

  function goNext() {
    if (nextStop) {
      openMapsTo(nextStop.address)
      router.push(`/driver/stop/${routeId}/${nextStop.stop_number}`)
    } else {
      // All stops done — navigate back to station
      openMapsTo(STATION_ADDRESS)
      router.push('/driver')
    }
  }

  if (loading || !stop) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const allVerified = toteStates.length > 0 && toteStates.every(t => t.state === 'verified' || t.state === 'error')
  const currentTote = toteStates[currentToteIdx]

  // ─── Success Screen ───────────────────────────────────────────────────────
  if (showSuccess) {
    const verified = toteStates.filter(t => t.state === 'verified').length
    const errors = toteStates.filter(t => t.state === 'error').length

    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <button onClick={() => router.push('/driver')} className="flex items-center gap-2 text-gray-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back to Route
        </button>

        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-black text-2xl text-brand-navy">Stop Complete!</h2>
          <p className="text-gray-500 text-sm mt-1">
            {stop.customer_name} — {stop.type === 'pickup' ? 'Pickup' : 'Delivery'}
          </p>
        </div>

        <div className="card space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Totes verified</span>
            <span className="font-bold text-green-600">{verified}</span>
          </div>
          {errors > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Errors flagged</span>
              <span className="font-bold text-red-600">{errors}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Next stop</span>
            <span className="font-bold text-brand-navy">
              {nextStop ? nextStop.customer_name : 'None — all done!'}
            </span>
          </div>
        </div>

        <button
          onClick={goNext}
          className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
        >
          {nextStop ? (
            <>Confirm & Navigate to Next Stop <ArrowRight className="w-5 h-5" /></>
          ) : (
            <>Navigate Back to Station <ArrowRight className="w-5 h-5" /></>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Back */}
      <button onClick={() => router.push('/driver')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Route
      </button>

      {/* Stop header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">
            {stop.stop_number}
          </div>
          <div>
            <h1 className="font-black text-xl">{stop.customer_name}</h1>
            <span className={`status-pill text-xs ${stop.type === 'pickup' ? 'bg-orange-500/30 text-orange-200' : 'bg-blue-500/30 text-blue-200'}`}>
              {stop.type === 'pickup' ? 'Pickup' : 'Delivery'}
            </span>
          </div>
        </div>
        <p className="text-white/70 text-sm mt-2">{stop.address}</p>
      </div>

      {/* Customer notes */}
      {stop.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-yellow-700 mb-1">Customer Notes</p>
          <p className="text-sm text-yellow-700">{stop.notes}</p>
        </div>
      )}

      {/* Navigate button */}
      <button
        onClick={openMaps}
        className="w-full flex items-center justify-center gap-2 border-2 border-brand-blue text-brand-blue rounded-2xl py-3 font-semibold text-sm hover:bg-blue-50 transition-colors"
      >
        <MapPin className="w-4 h-4" />
        Navigate to This Stop
      </button>

      {/* Tote table */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Totes ({stop.tote_ids.length})
        </h2>
        <div className="space-y-2">
          {toteStates.map((t) => (
            <div key={t.toteId} className={`card flex items-center gap-3 ${
              t.state === 'verified' ? 'border-green-200 bg-green-50' :
              t.state === 'error' ? 'border-red-200 bg-red-50' : ''
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.state === 'verified' ? 'bg-green-100' :
                t.state === 'error' ? 'bg-red-100' : 'bg-gray-100'
              }`}>
                {t.state === 'verified' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                {t.state === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                {(t.state === 'pending' || t.state === 'mismatch_1') && (
                  <Package className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm font-mono text-brand-navy">{t.toteId}</p>
                {t.sealNumber && (
                  <p className="text-xs text-gray-400">Seal: {t.sealNumber}</p>
                )}
              </div>
              <span className={`status-pill text-xs ${
                t.state === 'verified' ? 'bg-green-100 text-green-700' :
                t.state === 'error' ? 'bg-red-100 text-red-700' :
                t.state === 'mismatch_1' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {t.state === 'verified' ? 'Verified' :
                 t.state === 'error' ? 'Error' :
                 t.state === 'mismatch_1' ? 'Rescan' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Scanning workflow */}
      {scanning && currentTote && !allVerified && (
        <div className="card border-2 border-brand-blue/30 bg-brand-blue/5">
          <p className="text-xs font-bold text-brand-blue uppercase mb-1">
            {scanPhase === 'tote' ? 'Scan Tote Barcode' : 'Scan Security Seal'}
          </p>
          <p className="text-sm font-bold text-brand-navy mb-3">
            {scanPhase === 'tote'
              ? `Expecting: ${currentTote.toteId}`
              : `Expecting seal: ${currentTote.sealNumber ?? 'none'}`}
          </p>

          {scanError && (
            <div className="mb-3 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">{scanError}</p>
            </div>
          )}

          <BarcodeScanInput
            onScan={handleScan}
            placeholder={scanPhase === 'tote' ? 'Or enter tote ID…' : 'Or enter seal number…'}
          />

          {/* Partial delivery button */}
          <button
            onClick={() => setShowPartial(true)}
            className="mt-3 w-full text-center text-xs text-red-500 hover:text-red-700 font-semibold underline"
          >
            Can&apos;t find remaining totes — report partial delivery
          </button>
        </div>
      )}

      {/* Action buttons (before scanning) */}
      {!scanning && !stop.completed && (
        <div className="space-y-3">
          <button
            onClick={startScanning}
            className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
          >
            <ScanLine className="w-5 h-5" />
            {stop.type === 'pickup' ? 'Pickup Totes' : 'Deliver Totes'}
          </button>

          <button
            onClick={() => setShowForceComplete(true)}
            className="w-full border-2 border-red-200 text-red-600 rounded-2xl py-3 font-semibold text-sm hover:bg-red-50 transition-colors"
          >
            Force Complete
          </button>
        </div>
      )}

      {stop.completed && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-1" />
          <p className="font-bold text-green-700">Stop already completed</p>
        </div>
      )}

      {/* Force Complete Modal */}
      {showForceComplete && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowForceComplete(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 flex flex-col max-h-[85vh]">
            {/* Fixed header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-black text-brand-navy text-lg">Force Complete</h3>
                <p className="text-sm text-gray-500 mt-0.5">This will flag the stop for admin review.</p>
              </div>
              <button onClick={() => setShowForceComplete(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Error Code</label>
                <div className="space-y-2">
                  {FORCE_COMPLETE_CODES.map(({ code, label }) => (
                    <button
                      key={code}
                      onClick={() => setForceCode(code)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors text-sm ${
                        forceCode === code
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-mono font-bold">{code}</span> — {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (required)</label>
                <textarea
                  value={forceNotes}
                  onChange={e => setForceNotes(e.target.value)}
                  placeholder="Describe what happened..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
            </div>

            {/* Fixed footer button */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={handleForceComplete}
                disabled={!forceCode || !forceNotes.trim() || forceSaving}
                className="w-full bg-red-600 text-white rounded-2xl py-4 font-bold text-sm disabled:opacity-40 hover:bg-red-700 transition-colors"
              >
                {forceSaving ? 'Saving...' : 'Submit Force Complete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Partial Delivery Modal */}
      {showPartial && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowPartial(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-brand-navy text-lg">Partial Delivery</h3>
              <button onClick={() => setShowPartial(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Missing totes:</p>
              {toteStates.filter(t => t.state === 'pending' || t.state === 'mismatch_1').map(t => (
                <div key={t.toteId} className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2 mb-1.5">
                  <Package className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-mono font-bold text-red-700">{t.toteId}</span>
                  {t.sealNumber && <span className="text-xs text-red-500">Seal: {t.sealNumber}</span>}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason</label>
              <select
                value={partialReason}
                onChange={e => setPartialReason(e.target.value)}
                className="input-field"
              >
                <option value="">Select reason...</option>
                <option>Tote not at location</option>
                <option>Customer not home</option>
                <option>Wrong tote at location</option>
                <option>Tote damaged/unusable</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes for admin</label>
              <textarea
                value={partialNotes}
                onChange={e => setPartialNotes(e.target.value)}
                placeholder="Describe the situation..."
                rows={3}
                className="input-field resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPartial(false)}
                className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-3 font-semibold text-sm"
              >
                Back — Try Again
              </button>
              <button
                disabled={!partialReason}
                onClick={async () => {
                  if (!partialReason) return
                  const errId = `PD-${Math.floor(10000 + Math.random() * 90000)}`
                  const missing = toteStates.filter(t => t.state === 'pending' || t.state === 'mismatch_1')
                  await supabase.from('errors').insert({
                    id: errId,
                    type: 'partial_delivery',
                    driver_id: driverId,
                    route_id: routeId,
                    tote_id: missing[0]?.toteId ?? null,
                    stop_info: `${stop.customer_name} — ${stop.address}`,
                    detail: `Missing totes: ${missing.map(t => t.toteId).join(', ')}. Reason: ${partialReason}`,
                    driver_notes: partialNotes,
                    resolved: false,
                  })
                  setShowPartial(false)
                  // Mark remaining totes as error and complete stop
                  setToteStates(prev => prev.map(t =>
                    t.state === 'pending' || t.state === 'mismatch_1' ? { ...t, state: 'error' } : t
                  ))
                  void completeStop()
                }}
                className="flex-1 bg-red-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-40 hover:bg-red-700 transition-colors"
              >
                Submit to Admin
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
