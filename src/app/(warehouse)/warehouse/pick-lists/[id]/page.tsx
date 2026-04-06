'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PickList, PickListBin, PickListTote } from '@/types/database'
import { ScanLine, CheckCircle2, AlertTriangle, Package, ChevronLeft, ArrowRight } from 'lucide-react'

type PickPhase = 'bin' | 'totes' | 'complete'

export default function PickListDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [pickList, setPickList] = useState<PickList | null>(null)
  const [staffId, setStaffId] = useState('')
  const [loading, setLoading] = useState(true)

  const [phase, setPhase] = useState<PickPhase>('bin')
  const [binIdx, setBinIdx] = useState(0)
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState('')
  const [started, setStarted] = useState(false)

  // Local copy of bins for progress tracking
  const [bins, setBins] = useState<PickListBin[]>([])

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      const { data: cust } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (cust) setStaffId(cust.id)
    }

    const { data: pl } = await supabase.from('pick_lists').select('*').eq('id', id).single()
    if (!pl) { router.push('/warehouse/pick-lists'); return }
    const list = pl as PickList
    setPickList(list)
    setBins(list.bins as PickListBin[])
    setLoading(false)
  }, [supabase, id, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (started) setTimeout(() => inputRef.current?.focus(), 100)
  }, [phase, binIdx, started])

  const totalTotes = bins.reduce((s, b) => s + b.totes.length, 0)
  const pickedTotes = bins.reduce((s, b) => s + b.totes.filter(t => t.status === 'picked').length, 0)
  const pct = totalTotes > 0 ? Math.round((pickedTotes / totalTotes) * 100) : 0

  const currentBin = bins[binIdx]
  const pendingInCurrentBin = currentBin?.totes.filter(t => t.status === 'pending') ?? []
  const allBinsDone = bins.every(b => b.totes.every(t => t.status === 'picked'))

  async function saveProgress(updatedBins: PickListBin[]) {
    const allPicked = updatedBins.every(b => b.totes.every(t => t.status === 'picked'))
    await supabase.from('pick_lists').update({
      bins: updatedBins,
      status: allPicked ? 'complete' : 'in_progress',
      assigned_to: staffId || undefined,
      completed_at: allPicked ? new Date().toISOString() : undefined,
    }).eq('id', id)
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const val = scanValue.trim().toUpperCase()
    if (!val) return
    setScanError('')

    if (phase === 'bin') {
      if (val !== currentBin.bin_id) {
        setScanError(`Wrong bin! Expected ${currentBin.bin_id}, scanned ${val}. Try again.`)
        setScanValue('')
        return
      }
      setPhase('totes')
    } else {
      // Tote scan
      const toteIdx = currentBin.totes.findIndex(t => t.tote_id === val && t.status === 'pending')
      if (toteIdx === -1) {
        const alreadyPicked = currentBin.totes.find(t => t.tote_id === val && t.status === 'picked')
        if (alreadyPicked) {
          setScanError(`${val} already picked.`)
        } else {
          setScanError(`${val} not in this bin. Check the tote ID.`)
        }
        setScanValue('')
        return
      }

      // Mark tote as picked
      const updatedBins = bins.map((b, bi) => {
        if (bi !== binIdx) return b
        return {
          ...b,
          totes: b.totes.map((t, ti) =>
            ti === toteIdx ? { ...t, status: 'picked' as 'picked' } : t
          ),
        }
      })
      setBins(updatedBins)
      void saveProgress(updatedBins)

      // Update tote status in DB to 'picked'
      void supabase.from('totes').update({ status: 'picked' }).eq('id', val)
    }

    setScanValue('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function nextBin() {
    const next = binIdx + 1
    if (next < bins.length) {
      setBinIdx(next)
      setPhase('bin')
      setScanError('')
    } else {
      setPhase('complete')
    }
  }

  if (loading || !pickList) {
    return (
      <div className="px-5 pt-6 space-y-4">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    )
  }

  // ─── Complete Screen ────────────────────────────────────────────────────
  if (phase === 'complete' || allBinsDone) {
    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <button onClick={() => router.push('/warehouse/pick-lists')} className="flex items-center gap-2 text-gray-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="font-black text-2xl text-brand-navy">Pick List Complete!</h2>
          <p className="text-gray-500 text-sm mt-1">{pickList.id}</p>
        </div>
        <div className="card space-y-3">
          {[
            { label: 'Totes Picked', value: totalTotes },
            { label: 'Bins Visited', value: bins.length },
            { label: 'Completed', value: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold text-brand-navy">{value}</span>
            </div>
          ))}
        </div>
        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-brand-navy mb-1">Totes auto-added to Sort Drop Zone</p>
          <p className="text-xs text-gray-500">All {totalTotes} totes are now available for sorting and dispatch.</p>
        </div>
        <button onClick={() => router.push('/warehouse/pick-lists')} className="btn-primary w-full">
          Back to Pick Lists
        </button>
      </div>
    )
  }

  // ─── Not yet started ────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="px-5 pt-6 pb-6 space-y-5">
        <button onClick={() => router.push('/warehouse/pick-lists')} className="flex items-center gap-2 text-gray-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
          <p className="text-white/60 text-xs font-medium">Pick List</p>
          <h1 className="font-black text-2xl">{pickList.id}</h1>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="font-black text-2xl">{bins.length}</p>
              <p className="text-white/60 text-xs">Bins</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="font-black text-2xl">{totalTotes}</p>
              <p className="text-white/60 text-xs">Totes</p>
            </div>
          </div>
        </div>

        {/* Bin order preview */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Pick Order (A → B → C)</h2>
          <div className="space-y-2">
            {bins.map((b, i) => (
              <div key={b.bin_id} className="card flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center text-xs font-bold text-brand-blue flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-brand-navy text-sm">Bin {b.bin_id}</p>
                  <p className="text-xs text-gray-400">{b.totes.length} tote{b.totes.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {b.totes.map(t => (
                    <span key={t.tote_id} className="text-xs font-mono text-gray-400">{t.tote_id}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <button
          onClick={() => setStarted(true)}
          className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
        >
          Start Picking <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    )
  }

  // ─── Active picking ────────────────────────────────────────────────────
  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/warehouse/pick-lists')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Progress bar */}
      <div className="card">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold text-brand-navy">{pickList.id}</span>
          <span className="text-gray-500">{pickedTotes} / {totalTotes} picked</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-blue rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-right text-xs text-gray-400 mt-1">{pct}%</p>
      </div>

      {/* Current bin hero */}
      <div className="bg-brand-navy rounded-2xl px-5 py-6 text-center text-white">
        <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">
          {phase === 'bin' ? 'Go to Bin' : 'Now Picking From'}
        </p>
        <p className="font-black text-5xl tracking-tight">{currentBin.bin_id}</p>
        <p className="text-white/60 text-sm mt-2">
          {pendingInCurrentBin.length} tote{pendingInCurrentBin.length !== 1 ? 's' : ''} to pick
        </p>
      </div>

      {/* Tote list for current bin */}
      {phase === 'totes' && (
        <div className="space-y-2">
          {currentBin.totes.map(t => (
            <div key={t.tote_id} className={`card flex items-center gap-3 ${t.status === 'picked' ? 'opacity-50' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.status === 'picked' ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {t.status === 'picked'
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <Package className="w-4 h-4 text-gray-400" />
                }
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm font-mono text-brand-navy">{t.tote_id}</p>
                <p className="text-xs text-gray-400">{t.customer_name}</p>
              </div>
              <span className={`status-pill text-xs ${t.status === 'picked' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.status === 'picked' ? 'Picked' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scan input */}
      <div className="card border-2 border-brand-blue/30 bg-brand-blue/5 space-y-3">
        <p className="text-xs font-bold text-brand-blue uppercase">
          {phase === 'bin' ? 'Scan Bin Barcode to Confirm Location' : 'Scan Each Tote Barcode'}
        </p>

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
              placeholder={phase === 'bin' ? `Scan ${currentBin.bin_id}...` : 'Scan tote...'}
              className="input-field pl-9 text-sm"
            />
          </div>
          <button type="submit" className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm">
            OK
          </button>
        </form>
      </div>

      {/* Next bin button — shows when all totes in current bin are picked */}
      {phase === 'totes' && pendingInCurrentBin.length === 0 && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm font-bold text-green-700">All totes picked from Bin {currentBin.bin_id}!</p>
          </div>
          <button
            onClick={nextBin}
            className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl py-4 font-black text-base hover:bg-blue-900 active:scale-[0.98] transition-all shadow-lg"
          >
            {binIdx + 1 < bins.length ? (
              <>Next Bin <ArrowRight className="w-5 h-5" /></>
            ) : (
              <>Complete Pick List <CheckCircle2 className="w-5 h-5" /></>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
