'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { CheckCircle2, Package, X, Truck, PackagePlus } from 'lucide-react'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'

interface LoadedTote {
  toteId: string
  sealNumber: string | null
  customerName: string
  generic?: boolean // scanned to fulfill an expected_empty_count, not a pre-assigned tote
}

interface DeliveryStopInfo {
  stopNumber: number
  customerId: string
  customerName: string
  knownToteIds: { toteId: string; sealNumber: string | null }[]
  expectedEmptyCount: number
}

export default function LoadTruckPage() {
  const router = useRouter()
  const supabase = createClient()
  const [route, setRoute] = useState<Route | null>(null)
  const [loadedTotes, setLoadedTotes] = useState<LoadedTote[]>([])
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_id', userData.user.id)
      .single()
    if (!customer) return

    const today = new Date().toISOString().split('T')[0]
    const { data: routes } = await supabase
      .from('routes')
      .select('*')
      .eq('driver_id', customer.id)
      .eq('date', today)
      .neq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)

    if (routes && routes.length > 0) {
      const r = routes[0] as Route
      setRoute(r)

      // Generic-empty tote_ids only ever get added via an actual physical
      // scan (there's no dispatcher pre-assignment path for them) -- so
      // unlike dispatcher-assigned totes, which still need a fresh scan each
      // session to confirm physical possession, these were already confirmed
      // the moment they were first scanned. Pre-mark them loaded instead of
      // asking the driver to re-scan totes they've already scanned once.
      const preLoaded: LoadedTote[] = []
      for (const stop of r.stops as RouteStop[]) {
        if (stop.type !== 'delivery' || !stop.expected_empty_count) continue
        for (const toteId of stop.tote_ids) {
          preLoaded.push({ toteId, sealNumber: null, customerName: stop.customer_name, generic: true })
        }
      }
      if (preLoaded.length > 0) setLoadedTotes(preLoaded)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // Derived live from `route` (not a separate snapshot state) -- this was the
  // actual bug: a previous version computed this once at page load and never
  // updated it as scans succeeded within the same session, so a tote that had
  // already been registered and persisted to the route mid-session stopped
  // being recognized as "known" and got wrongly rejected as not-on-route.
  const deliveryStops = useMemo<DeliveryStopInfo[]>(() => {
    if (!route) return []
    const info: DeliveryStopInfo[] = []
    for (const stop of route.stops as RouteStop[]) {
      if (stop.type !== 'delivery') continue
      info.push({
        stopNumber: stop.stop_number,
        customerId: stop.customer_id,
        customerName: stop.customer_name,
        knownToteIds: stop.tote_ids.map((toteId, i) => ({ toteId, sealNumber: stop.seal_numbers?.[i] ?? null })),
        expectedEmptyCount: stop.expected_empty_count ?? 0,
      })
    }
    return info
  }, [route])

  // A stop's real total is whichever is larger -- tote_ids already fills in
  // as expectedEmptyCount gets satisfied, so counting both in full would
  // double-count. Also fixes a bug: the old formula always added the full
  // expectedEmptyCount on top of knownToteIds even after they'd converged.
  const totalExpected = deliveryStops.reduce((n, s) => n + Math.max(s.knownToteIds.length, s.expectedEmptyCount), 0)

  async function handleScan(val: string) {
    setScanError('')
    if (loadedTotes.some(t => t.toteId === val)) {
      setScanError(`${val} already scanned.`)
      return
    }

    // 1. Does this match a tote already on a stop -- either pre-assigned, or
    // registered earlier in this same session (now live via the useMemo above)?
    for (const stop of deliveryStops) {
      const known = stop.knownToteIds.find(t => t.toteId === val)
      if (known) {
        setLoadedTotes(prev => [...prev, { toteId: val, sealNumber: known.sealNumber, customerName: stop.customerName }])
        return
      }
    }

    // 2. Not known — does any stop still need more generic empties?
    const target = deliveryStops.find(s => s.knownToteIds.length < s.expectedEmptyCount)
    if (!target) {
      setScanError(`${val} is not on today's route, and no delivery on this route still needs empty totes.`)
      return
    }

    setScanning(true)
    // Does this tote already exist? (e.g. reusing one of the customer's own empties)
    const { data: existing } = await supabase.from('totes').select('id, customer_id').eq('id', val).maybeSingle()

    if (existing && existing.customer_id !== target.customerId) {
      setScanError(`${val} is already assigned to a different customer — can't use it for ${target.customerName}'s delivery.`)
      setScanning(false)
      return
    }

    if (!existing) {
      const { error } = await supabase.from('totes').insert({
        id: val,
        customer_id: target.customerId,
        status: 'in_transit',
        items: [],
      })
      if (error) {
        setScanError(`Couldn't register ${val}: ${error.message}`)
        setScanning(false)
        return
      }
    }

    // Persist this tote onto the route's stop record so it's tracked for
    // real (stop detail, force-complete, etc. all read stops.tote_ids). Only
    // count it as loaded if this actually succeeds -- previously local state
    // updated regardless, so a failed write here could look like success.
    if (!route) { setScanning(false); return }
    const stops = route.stops as RouteStop[]
    const updatedStops = stops.map(s =>
      s.stop_number === target.stopNumber ? { ...s, tote_ids: [...s.tote_ids, val] } : s
    )
    const { error: routeError } = await supabase.from('routes').update({ stops: updatedStops }).eq('id', route.id)
    if (routeError) {
      setScanError(`Registered ${val} but couldn't attach it to the route: ${routeError.message}. Try scanning it again.`)
      setScanning(false)
      return
    }
    setRoute(prev => prev ? { ...prev, stops: updatedStops } : prev)

    setLoadedTotes(prev => [...prev, { toteId: val, sealNumber: null, customerName: target.customerName, generic: true }])
    setScanning(false)
  }

  function removeTote(toteId: string) {
    setLoadedTotes(prev => prev.filter(t => t.toteId !== toteId))
    // Note: doesn't un-register a newly-created generic tote or roll back
    // the route's stops.tote_ids — removing here is "I scanned the wrong
    // thing," not "undo the registration." Simplest correct behavior would
    // need a bigger undo path; not built.
  }

  // Deliberately no `totalExpected > 0 &&` guard here — a pickup-only route
  // has totalExpected === 0, and 0 loaded out of 0 expected IS "all loaded."
  // (Previously required totalExpected > 0, which meant a pickup-only route
  // could never satisfy this and the Start Route button — gated on
  // allLoaded below — never appeared at all, despite the "Pickup-only
  // route... tap below when ready to depart" notice already promising one.)
  const allLoaded = loadedTotes.length === totalExpected

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-16 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!route) {
    return (
      <div className="px-5 pt-12 text-center">
        <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-400 text-lg">No Route Assigned</p>
        <p className="text-gray-400 text-sm mt-1">A route must be assigned before loading the truck.</p>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-4 text-white">
        <p className="text-white/60 text-xs font-medium">Route {route.id}</p>
        <h1 className="font-black text-xl">Load Truck</h1>
        <p className="text-white/60 text-sm mt-1">
          Scan each delivery tote before departing.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="bg-white/10 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="font-black text-2xl">{loadedTotes.length}</p>
            <p className="text-white/60 text-xs">Loaded</p>
          </div>
          <div className="text-white/40 font-bold text-xl">/</div>
          <div className="bg-white/10 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="font-black text-2xl">{totalExpected}</p>
            <p className="text-white/60 text-xs">Expected</p>
          </div>
        </div>
      </div>

      {/* Scan input */}
      <div className="space-y-2">
        <BarcodeScanInput
          onScan={handleScan}
          placeholder="Or type tote ID (e.g. TV-1001)"
          disabled={scanning}
          autoFocusManual
        />
        {scanError && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {scanError}
          </p>
        )}
      </div>

      {/* Loaded list */}
      {loadedTotes.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            On Truck
          </h2>
          <div className="space-y-2">
            {loadedTotes.map(t => (
              <div key={t.toteId} className="card flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${t.generic ? 'bg-purple-100' : 'bg-green-100'}`}>
                  {t.generic ? <PackagePlus className="w-4 h-4 text-purple-600" /> : <Package className="w-4 h-4 text-green-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm font-mono">{t.toteId}</p>
                  <p className="text-xs text-gray-400">
                    {t.customerName}
                    {t.sealNumber && ` · Seal: ${t.sealNumber}`}
                    {t.generic && ' · new empty'}
                  </p>
                </div>
                <span className="status-pill bg-green-100 text-green-700 whitespace-nowrap text-xs">
                  On Truck
                </span>
                <button
                  onClick={() => removeTote(t.toteId)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pickup-only route notice */}
      {totalExpected === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-bold text-brand-navy">Pickup-only route</p>
          <p className="text-xs text-gray-500 mt-0.5">No delivery totes to load. Tap below when ready to depart.</p>
        </div>
      )}

      {/* Still to load */}
      {totalExpected > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Still to Load ({totalExpected - loadedTotes.length})
          </h2>
          <div className="space-y-2">
            {deliveryStops.flatMap(stop =>
              stop.knownToteIds
                .filter(t => !loadedTotes.some(l => l.toteId === t.toteId))
                .map(t => (
                  <div key={t.toteId} className="card flex items-center gap-3 opacity-60">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-navy text-sm font-mono">{t.toteId}</p>
                      <p className="text-xs text-gray-400">
                        {stop.customerName}
                        {t.sealNumber && ` · Seal: ${t.sealNumber}`}
                      </p>
                    </div>
                  </div>
                ))
            )}
            {deliveryStops.map(stop => {
              const remaining = stop.expectedEmptyCount - stop.knownToteIds.length
              if (remaining <= 0) return null
              return (
                <div key={`generic-${stop.stopNumber}`} className="card flex items-center gap-3 border-2 border-dashed border-purple-200 bg-purple-50/50">
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <PackagePlus className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-purple-700 text-sm">{remaining} empty tote{remaining !== 1 ? 's' : ''} needed</p>
                    <p className="text-xs text-purple-500">
                      For {stop.customerName} — grab from the dock, scan any barcode
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Done loading button */}
      {allLoaded && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <p className="text-green-700 font-semibold text-sm">
              {totalExpected > 0 ? `All ${totalExpected} totes loaded!` : 'No totes to load — ready to depart!'}
            </p>
          </div>
          <button
            onClick={async () => {
              if (!route) return
              await supabase
                .from('routes')
                .update({ status: 'in_progress' })
                .eq('id', route.id)
              router.push('/driver')
            }}
            className="w-full bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
          >
            {totalExpected > 0 ? 'Done Loading — Start Route' : 'Start Route'}
          </button>
        </div>
      )}
    </div>
  )
}
