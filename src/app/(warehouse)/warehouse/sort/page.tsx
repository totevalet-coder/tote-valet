'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStop } from '@/types/database'
import { ScanLine, Package, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'

interface DropZoneTote {
  id: string
  customer_name: string
  seal_number: string | null
}

interface SortDestination {
  routeId: string
  driverName: string
  zoneLabel: string
}

export default function SortPage() {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [dropZone, setDropZone] = useState<DropZoneTote[]>([])
  const [sortedCount, setSortedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState('')
  const [destination, setDestination] = useState<SortDestination | null>(null)
  const [scannedTote, setScannedTote] = useState<DropZoneTote | null>(null)

  const [zoneScan, setZoneScan] = useState('')
  const [zoneError, setZoneError] = useState('')
  const [zoneSaved, setZoneSaved] = useState(false)

  const loadDropZone = useCallback(async () => {
    const { data: totes } = await supabase
      .from('totes')
      .select('id, seal_number, customer_id')
      .eq('status', 'picked')
      .order('updated_at', { ascending: true })

    if (totes) {
      const enriched: DropZoneTote[] = []
      for (const t of totes) {
        const { data: cust } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
        enriched.push({ id: t.id, customer_name: cust?.name ?? 'Unknown', seal_number: t.seal_number })
      }
      setDropZone(enriched)
    }

    const { data: sorted } = await supabase.from('totes').select('id').eq('status', 'returned_to_station')
    setSortedCount(sorted?.length ?? 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadDropZone() }, [loadDropZone])

  async function handleToteScan(e: React.FormEvent) {
    e.preventDefault()
    const val = scanValue.trim().toUpperCase()
    if (!val) return
    setScanError('')
    setDestination(null)
    setScannedTote(null)
    setZoneSaved(false)

    const tote = dropZone.find(t => t.id === val)
    if (!tote) {
      setScanError(`${val} is not in the Sort Drop Zone. Check that it has been picked.`)
      setScanValue('')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: routes } = await supabase.from('routes').select('id, driver_id, stops').eq('date', today)

    let foundRoute: { id: string; driverId: string } | null = null
    for (const r of routes ?? []) {
      const stops = r.stops as RouteStop[]
      if (stops.some(s => s.tote_ids.includes(val))) {
        foundRoute = { id: r.id, driverId: r.driver_id ?? '' }
        break
      }
    }

    if (!foundRoute) {
      setScanError(`No route found for ${val} today. Contact admin.`)
      setScanValue('')
      return
    }

    const { data: driver } = await supabase.from('customers').select('name').eq('id', foundRoute.driverId).single()
    setScannedTote(tote)
    setDestination({ routeId: foundRoute.id, driverName: driver?.name ?? 'Unknown Driver', zoneLabel: foundRoute.id })
    setScanValue('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleZoneScan(e: React.FormEvent) {
    e.preventDefault()
    const val = zoneScan.trim().toUpperCase()
    if (!val || !destination || !scannedTote) return
    setZoneError('')

    if (val !== destination.routeId) {
      setZoneError(`Wrong zone! Expected ${destination.routeId}, scanned ${val}. Try again.`)
      setZoneScan('')
      return
    }

    await supabase.from('totes').update({
      status: 'returned_to_station',
      last_scan_date: new Date().toISOString(),
    }).eq('id', scannedTote.id)

    setZoneSaved(true)
    setZoneScan('')
    await loadDropZone()
    setTimeout(() => {
      setDestination(null)
      setScannedTote(null)
      setZoneSaved(false)
      inputRef.current?.focus()
    }, 1500)
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-16 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Sort Department</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center py-4">
          <span className="text-2xl">📦</span>
          <p className="font-black text-3xl mt-1 text-amber-600">{dropZone.length}</p>
          <p className="text-xs text-gray-500 mt-1">In Drop Zone</p>
        </div>
        <div className="card text-center py-4">
          <span className="text-2xl">✅</span>
          <p className="font-black text-3xl mt-1 text-green-600">{sortedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Sorted to Routes</p>
        </div>
      </div>

      <div className="card border-2 border-brand-blue/30 bg-brand-blue/5 space-y-3">
        <p className="text-xs font-bold text-brand-blue uppercase">Scan Tote from Drop Zone</p>

        {scanError && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700">{scanError}</p>
          </div>
        )}

        {!destination && (
          <form onSubmit={handleToteScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input ref={inputRef} autoFocus type="text" value={scanValue}
                onChange={e => { setScanValue(e.target.value); setScanError('') }}
                placeholder="Scan tote barcode..." className="input-field pl-9 text-sm" />
            </div>
            <button type="submit" className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm">OK</button>
          </form>
        )}

        {destination && scannedTote && !zoneSaved && (
          <div className="space-y-3">
            <div className="bg-brand-navy rounded-2xl px-5 py-5 text-center text-white">
              <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">Send to Zone</p>
              <p className="font-black text-4xl tracking-tight">{destination.zoneLabel}</p>
              <p className="text-white/70 text-sm mt-1">{destination.driverName}</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 space-y-1 border border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tote</span>
                <span className="font-bold font-mono text-brand-navy">{scannedTote.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Customer</span>
                <span className="font-semibold text-brand-navy">{scannedTote.customer_name}</span>
              </div>
              {scannedTote.seal_number && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Seal</span>
                  <span className="font-mono text-gray-600">{scannedTote.seal_number}</span>
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-brand-blue uppercase">Now Scan Zone Barcode to Confirm</p>
            {zoneError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <p className="text-sm text-red-700">{zoneError}</p>
              </div>
            )}
            <form onSubmit={handleZoneScan} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input autoFocus type="text" value={zoneScan}
                  onChange={e => { setZoneScan(e.target.value); setZoneError('') }}
                  placeholder={`Scan ${destination.zoneLabel}...`} className="input-field pl-9 text-sm" />
              </div>
              <button type="submit" className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm">OK</button>
            </form>
            <button onClick={() => { setDestination(null); setScannedTote(null); setScanError(''); setZoneError('') }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-semibold">
              ← Cancel, scan different tote
            </button>
          </div>
        )}

        {zoneSaved && (
          <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="font-bold text-green-700 text-sm">Tote placed in zone!</p>
          </div>
        )}
      </div>

      {dropZone.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Drop Zone ({dropZone.length})</h2>
          <div className="space-y-2">
            {dropZone.map(t => (
              <div key={t.id} className="card flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm font-mono text-brand-navy">{t.id}</p>
                  <p className="text-xs text-gray-400">{t.customer_name}{t.seal_number ? ` · Seal: ${t.seal_number}` : ''}</p>
                </div>
                <span className="status-pill bg-amber-100 text-amber-700 text-xs whitespace-nowrap">Drop Zone</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dropZone.length === 0 && (
        <div className="text-center py-10">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">Drop Zone Empty</p>
          <p className="text-gray-400 text-sm mt-1">All totes have been sorted to route zones.</p>
        </div>
      )}

      <button onClick={() => router.push('/warehouse/sort/staging')}
        className="w-full flex items-center justify-center gap-2 border-2 border-brand-blue text-brand-blue rounded-2xl py-3 font-semibold text-sm hover:bg-blue-50 transition-colors">
        View Route Staging Zones <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
