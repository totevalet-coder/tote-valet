'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { CheckCircle2, Package, X, Truck } from 'lucide-react'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'

interface LoadedTote {
  toteId: string
  sealNumber: string | null
  customerName: string
}

export default function LoadTruckPage() {
  const router = useRouter()
  const supabase = createClient()
  const [route, setRoute] = useState<Route | null>(null)
  const [expectedTotes, setExpectedTotes] = useState<{ toteId: string; sealNumber: string | null; customerName: string }[]>([])
  const [loadedTotes, setLoadedTotes] = useState<LoadedTote[]>([])
  const [scanError, setScanError] = useState('')
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

      // Build expected totes list — delivery stops only (pickup totes are already at customer)
      const stops = r.stops as RouteStop[]
      const allTotes: { toteId: string; sealNumber: string | null; customerName: string }[] = []
      for (const stop of stops) {
        if (stop.type !== 'delivery') continue
        stop.tote_ids.forEach((toteId, i) => {
          allTotes.push({
            toteId,
            sealNumber: stop.seal_numbers?.[i] ?? null,
            customerName: stop.customer_name,
          })
        })
      }
      setExpectedTotes(allTotes)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  function handleScan(val: string) {
    setScanError('')
    if (loadedTotes.some(t => t.toteId === val)) {
      setScanError(`${val} already scanned.`)
      return
    }
    const expected = expectedTotes.find(t => t.toteId === val)
    if (!expected) {
      setScanError(`${val} is not on today's route. Check the tote ID.`)
      return
    }
    setLoadedTotes(prev => [...prev, expected])
  }

  function removeTote(toteId: string) {
    setLoadedTotes(prev => prev.filter(t => t.toteId !== toteId))
  }

  // allLoaded is true when all delivery totes are scanned, OR when route has no deliveries (pickup-only)
  const allLoaded = loadedTotes.length === expectedTotes.length

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
            <p className="font-black text-2xl">{expectedTotes.length}</p>
            <p className="text-white/60 text-xs">Expected</p>
          </div>
        </div>
      </div>

      {/* Scan input */}
      <div className="space-y-2">
        <BarcodeScanInput
          onScan={handleScan}
          placeholder="Or type tote ID (e.g. TV-1001)"
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
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm font-mono">{t.toteId}</p>
                  <p className="text-xs text-gray-400">
                    {t.customerName}
                    {t.sealNumber && ` · Seal: ${t.sealNumber}`}
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
      {expectedTotes.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-bold text-brand-navy">Pickup-only route</p>
          <p className="text-xs text-gray-500 mt-0.5">No delivery totes to load. Tap below when ready to depart.</p>
        </div>
      )}

      {/* Expected totes not yet loaded */}
      {expectedTotes.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Still to Load ({expectedTotes.length - loadedTotes.length})
          </h2>
          <div className="space-y-2">
            {expectedTotes
              .filter(t => !loadedTotes.some(l => l.toteId === t.toteId))
              .map(t => (
                <div key={t.toteId} className="card flex items-center gap-3 opacity-60">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy text-sm font-mono">{t.toteId}</p>
                    <p className="text-xs text-gray-400">
                      {t.customerName}
                      {t.sealNumber && ` · Seal: ${t.sealNumber}`}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Done loading button */}
      {allLoaded && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <p className="text-green-700 font-semibold text-sm">All {expectedTotes.length} totes loaded!</p>
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
            Done Loading — Start Route
          </button>
        </div>
      )}
    </div>
  )
}
