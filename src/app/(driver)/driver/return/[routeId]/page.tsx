'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { CheckCircle2, AlertTriangle, Package, ChevronLeft, PackageCheck } from 'lucide-react'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'

interface ReturnTote {
  id: string
  customerName: string
  sealNumber: string | null
  returned: boolean
}

export default function ReturnToWarehousePage() {
  const router = useRouter()
  const { routeId } = useParams<{ routeId: string }>()
  const supabase = createClient()

  const [totes, setTotes] = useState<ReturnTote[]>([])
  const [loading, setLoading] = useState(true)
  const [scanError, setScanError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('routes').select('*').eq('id', routeId).single()
    if (!r) { router.push('/driver'); return }

    const route = r as Route
    const stops = route.stops as RouteStop[]

    // Collect all tote IDs from pickup stops
    const pickupToteIds: string[] = []
    for (const stop of stops) {
      if (stop.type === 'pickup') pickupToteIds.push(...stop.tote_ids)
    }

    if (pickupToteIds.length === 0) {
      // No pickup totes — mark complete and go home
      await supabase.from('routes').update({
        status: 'complete',
        completed_at: new Date().toISOString(),
      }).eq('id', routeId)
      router.push('/driver')
      return
    }

    // Only show totes that still need to be returned (in_transit or already scanned in this session)
    const { data: toteData } = await supabase
      .from('totes')
      .select('id, seal_number, customer_id, status')
      .in('id', pickupToteIds)
      .in('status', ['in_transit', 'ready_to_stow'])

    const enriched: ReturnTote[] = []
    for (const t of toteData ?? []) {
      const { data: cust } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
      enriched.push({
        id: t.id,
        customerName: cust?.name ?? 'Unknown',
        sealNumber: t.seal_number,
        returned: t.status === 'ready_to_stow',
      })
    }

    setTotes(enriched)
    setLoading(false)
  }, [supabase, routeId, router])

  useEffect(() => { load() }, [load])

  function handleScan(val: string) {
    setScanError('')
    const idx = totes.findIndex(t => t.id === val)
    if (idx === -1) { setScanError(`${val} is not on this route's pickup list.`); return }
    if (totes[idx].returned) { setScanError(`${val} already scanned in.`); return }

    // Immediately write to DB
    supabase.from('totes').update({
      status: 'ready_to_stow',
      last_scan_date: new Date().toISOString(),
    }).eq('id', val).then(() => {})

    setTotes(prev => prev.map((t, i) => i === idx ? { ...t, returned: true } : t))
  }

  async function handleConfirm() {
    setConfirming(true)

    // Safety: catch any that weren't scanned (shouldn't happen if allReturned, but just in case)
    const unscanned = totes.filter(t => !t.returned)
    if (unscanned.length > 0) {
      await supabase.from('totes').update({
        status: 'ready_to_stow',
        last_scan_date: new Date().toISOString(),
      }).in('id', unscanned.map(t => t.id))
    }

    await supabase.from('routes').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', routeId)

    setConfirming(false)
    setConfirmed(true)
  }

  const returnedCount = totes.filter(t => t.returned).length
  const allReturned = totes.length > 0 && returnedCount === totes.length

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-black text-2xl text-brand-navy">Route Complete!</h2>
          <p className="text-gray-500 text-sm mt-1">
            {returnedCount} tote{returnedCount !== 1 ? 's' : ''} handed to warehouse
          </p>
        </div>

        <div className="card space-y-3">
          {[
            { label: 'Totes Returned', value: returnedCount },
            { label: 'Route', value: routeId },
            { label: 'Status', value: '✓ Complete' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold text-brand-navy">{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-brand-navy">Warehouse notified</p>
          <p className="text-xs text-gray-500 mt-0.5">
            All totes marked Ready to Stow. Great work today!
          </p>
        </div>

        <button onClick={() => router.push('/driver')} className="btn-primary w-full">
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/driver')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Route
      </button>

      {/* Header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <p className="text-white/60 text-xs font-medium">Return to Warehouse</p>
        <h1 className="font-black text-xl">Unload Totes</h1>
        <p className="text-white/70 text-sm mt-0.5">Route {routeId}</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="font-black text-2xl">{returnedCount}</p>
            <p className="text-white/60 text-xs">Scanned In</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="font-black text-2xl">{totes.length}</p>
            <p className="text-white/60 text-xs">Total to Return</p>
          </div>
        </div>
      </div>

      {/* Scan input */}
      {!allReturned && (
        <div className="card border-2 border-brand-blue/30 bg-brand-blue/5 space-y-3">
          <p className="text-xs font-bold text-brand-blue uppercase">Scan Each Tote as You Unload</p>
          {scanError && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">{scanError}</p>
            </div>
          )}
          <BarcodeScanInput onScan={handleScan} placeholder="Or enter tote ID…" />
        </div>
      )}

      {/* Tote list */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Totes to Return ({totes.length})
        </h2>
        <div className="space-y-2">
          {totes.map(t => (
            <div key={t.id} className={`card flex items-center gap-3 ${t.returned ? '' : 'opacity-60'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.returned ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {t.returned
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <Package className="w-4 h-4 text-gray-400" />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm font-mono text-brand-navy">{t.id}</p>
                <p className="text-xs text-gray-400">
                  {t.customerName}{t.sealNumber ? ` · Seal: ${t.sealNumber}` : ''}
                </p>
              </div>
              <span className={`status-pill text-xs ${
                t.returned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {t.returned ? 'Scanned In' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Confirm button — only when all returned */}
      {allReturned && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="font-bold text-green-700 text-sm">
              All {totes.length} totes scanned in!
            </p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg disabled:opacity-60"
          >
            <PackageCheck className="w-5 h-5" />
            {confirming ? 'Completing Route...' : 'Confirm & Complete Route'}
          </button>
        </div>
      )}
    </div>
  )
}
