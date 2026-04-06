'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { ScanLine, CheckCircle2, AlertTriangle, Package, ChevronLeft, Truck } from 'lucide-react'

interface LoadTote {
  id: string
  customerName: string
  sealNumber: string | null
  loaded: boolean
}

export default function LoadVerificationPage() {
  const router = useRouter()
  const { routeId } = useParams<{ routeId: string }>()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [route, setRoute] = useState<Route | null>(null)
  const [driverName, setDriverName] = useState('')
  const [totes, setTotes] = useState<LoadTote[]>([])
  const [loading, setLoading] = useState(true)

  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('routes').select('*').eq('id', routeId).single()
    if (!r) { router.push('/sorter/staging'); return }

    const route = r as Route
    setRoute(route)

    const { data: driver } = await supabase.from('customers').select('name').eq('id', route.driver_id ?? '').single()
    setDriverName(driver?.name ?? 'Unknown Driver')

    const stops = route.stops as RouteStop[]
    const allToteIds: string[] = []
    for (const stop of stops) allToteIds.push(...stop.tote_ids)

    const { data: toteData } = await supabase
      .from('totes')
      .select('id, seal_number, customer_id')
      .in('id', allToteIds)

    const enriched: LoadTote[] = []
    for (const t of toteData ?? []) {
      const { data: cust } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
      enriched.push({ id: t.id, customerName: cust?.name ?? 'Unknown', sealNumber: t.seal_number, loaded: false })
    }

    setTotes(enriched)
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [supabase, routeId, router])

  useEffect(() => { load() }, [load])

  function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const val = scanValue.trim().toUpperCase()
    if (!val) return
    setScanError('')

    const idx = totes.findIndex(t => t.id === val)
    if (idx === -1) {
      setScanError(`${val} is not on this route. Check the tote ID.`)
      setScanValue('')
      return
    }
    if (totes[idx].loaded) {
      setScanError(`${val} already scanned.`)
      setScanValue('')
      return
    }

    setTotes(prev => prev.map((t, i) => i === idx ? { ...t, loaded: true } : t))
    setScanValue('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleConfirm() {
    if (!route) return
    setConfirming(true)

    // Update all totes to in_transit
    const toteIds = totes.map(t => t.id)
    await supabase.from('totes').update({
      status: 'in_transit',
      last_scan_date: new Date().toISOString(),
    }).in('id', toteIds)

    // Update route to in_progress
    await supabase.from('routes').update({ status: 'in_progress' }).eq('id', routeId)

    setConfirming(false)
    setConfirmed(true)
  }

  const loadedCount = totes.filter(t => t.loaded).length
  const allLoaded = totes.length > 0 && loadedCount === totes.length

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  // ─── Confirmed screen ───────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Truck className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-black text-2xl text-brand-navy">Route Ready to Depart!</h2>
          <p className="text-gray-500 text-sm mt-1">Route {routeId} — {driverName}</p>
        </div>

        <div className="card space-y-3">
          {[
            { label: 'Totes Loaded', value: totes.length },
            { label: 'Driver', value: driverName },
            { label: 'All statuses', value: '→ In Transit' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold text-brand-navy">{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-brand-navy">Driver has been notified</p>
          <p className="text-xs text-gray-500 mt-0.5">All {totes.length} totes marked In Transit and route is active.</p>
        </div>

        <button onClick={() => router.push('/sorter/staging')} className="btn-primary w-full">
          Back to Staging Zones
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/sorter/staging')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Staging
      </button>

      {/* Route summary */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <p className="text-white/60 text-xs font-medium">Driver Load Verification</p>
        <h1 className="font-black text-xl">Route {routeId}</h1>
        <p className="text-white/70 text-sm mt-0.5">{driverName}</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="font-black text-2xl">{loadedCount}</p>
            <p className="text-white/60 text-xs">Loaded</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="font-black text-2xl">{totes.length}</p>
            <p className="text-white/60 text-xs">Total</p>
          </div>
        </div>
      </div>

      {/* Scan input */}
      {!allLoaded && (
        <div className="card border-2 border-brand-blue/30 bg-brand-blue/5 space-y-3">
          <p className="text-xs font-bold text-brand-blue uppercase">Scan Each Tote as it&apos;s Loaded</p>
          {scanError && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">{scanError}</p>
            </div>
          )}
          <form onSubmit={handleScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={scanValue}
                onChange={e => { setScanValue(e.target.value); setScanError('') }}
                placeholder="Scan tote barcode..."
                className="input-field pl-9 text-sm"
              />
            </div>
            <button type="submit" className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm">OK</button>
          </form>
        </div>
      )}

      {/* Tote list */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Totes ({totes.length})
        </h2>
        <div className="space-y-2">
          {totes.map(t => (
            <div key={t.id} className={`card flex items-center gap-3 ${t.loaded ? '' : 'opacity-60'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.loaded ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {t.loaded
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <Package className="w-4 h-4 text-gray-400" />
                }
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm font-mono text-brand-navy">{t.id}</p>
                <p className="text-xs text-gray-400">{t.customerName}{t.sealNumber ? ` · Seal: ${t.sealNumber}` : ''}</p>
              </div>
              <span className={`status-pill text-xs ${t.loaded ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.loaded ? 'Loaded' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Confirm button — only when all loaded */}
      {allLoaded && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="font-bold text-green-700 text-sm">All {totes.length} totes loaded and verified!</p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg disabled:opacity-60"
          >
            <Truck className="w-5 h-5" />
            {confirming ? 'Confirming...' : 'Confirm Route Ready to Depart'}
          </button>
        </div>
      )}
    </div>
  )
}
