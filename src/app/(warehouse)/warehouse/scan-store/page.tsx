'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScanLine, CheckCircle2, AlertTriangle, Package, ArrowRight, Clock } from 'lucide-react'
import { Suspense } from 'react'

type Tab = 'receive' | 'unstowed'
type ReceiveStep = 1 | 2 | 'done'

interface ScannedTote {
  id: string
  sealNumber: string | null
  customerName: string
  onManifest: boolean
}

interface UnstowedTote {
  id: string
  seal_number: string | null
  customerName: string
  receivedAt: string
}

function ScanStoreContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'unstowed' ? 'unstowed' : 'receive')
  const [step, setStep] = useState<ReceiveStep>(1)
  const [staffId, setStaffId] = useState('')

  // Step 1 state
  const [toteScan, setToteScan] = useState('')
  const [scannedTote, setScannedTote] = useState<ScannedTote | null>(null)
  const [toteError, setToteError] = useState('')
  const [toteLoading, setToteLoading] = useState(false)

  // Step 2 state
  const [binScan, setBinScan] = useState('')
  const [binError, setBinError] = useState('')
  const [binLoading, setBinLoading] = useState(false)

  // Done state
  const [doneInfo, setDoneInfo] = useState<{ toteId: string; bin: string; time: string } | null>(null)

  // Unstowed tab
  const [unstowedTotes, setUnstowedTotes] = useState<UnstowedTote[]>([])
  const [unstowedLoading, setUnstowedLoading] = useState(true)
  // Quick stow: pre-selects a tote for step 2
  const [quickStowTote, setQuickStowTote] = useState<UnstowedTote | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: cust } = await supabase.from('customers').select('id').eq('auth_id', data.user.id).single()
      if (cust) setStaffId(cust.id)
    })
  }, [supabase])

  const loadUnstowed = useCallback(async () => {
    setUnstowedLoading(true)
    const { data: totes } = await supabase
      .from('totes')
      .select('id, seal_number, customer_id')
      .eq('status', 'ready_to_stow')
      .order('updated_at', { ascending: true })

    if (totes) {
      const enriched: UnstowedTote[] = []
      for (const t of totes) {
        const { data: cust } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
        enriched.push({
          id: t.id,
          seal_number: t.seal_number,
          customerName: cust?.name ?? 'Unknown',
          receivedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        })
      }
      setUnstowedTotes(enriched)
    }
    setUnstowedLoading(false)
  }, [supabase])

  useEffect(() => {
    if (tab === 'unstowed') loadUnstowed()
  }, [tab, loadUnstowed])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [step, tab])

  async function handleToteScan(e: React.FormEvent) {
    e.preventDefault()
    const val = toteScan.trim().toUpperCase()
    if (!val) return
    setToteError('')
    setToteLoading(true)

    // Look up tote
    const { data: tote } = await supabase
      .from('totes')
      .select('id, seal_number, customer_id, status')
      .eq('id', val)
      .single()

    if (!tote) {
      setToteError(`Tote ${val} not found in system. Notify admin.`)
      setToteLoading(false)
      return
    }

    const { data: cust } = await supabase.from('customers').select('name').eq('id', tote.customer_id).single()

    // Check if on today's inbound manifest (in_transit = expected inbound)
    const onManifest = tote.status === 'in_transit' || tote.status === 'ready_to_stow'

    setScannedTote({
      id: tote.id,
      sealNumber: tote.seal_number,
      customerName: cust?.name ?? 'Unknown',
      onManifest,
    })

    // Update tote to ready_to_stow if it was in_transit
    if (tote.status === 'in_transit') {
      await supabase.from('totes').update({ status: 'ready_to_stow' }).eq('id', val)
    }

    setToteLoading(false)
    setStep(2)
    setToteScan('')
  }

  async function handleBinScan(e: React.FormEvent) {
    e.preventDefault()
    const val = binScan.trim().toUpperCase()
    if (!val || !scannedTote) return
    setBinError('')
    setBinLoading(true)

    // Check bin exists and has space
    const { data: bin } = await supabase
      .from('bins')
      .select('id, capacity, current_count')
      .eq('id', val)
      .single()

    if (!bin) {
      setBinError(`Bin ${val} not found. Check ID and try again.`)
      setBinLoading(false)
      return
    }

    if (bin.current_count >= bin.capacity) {
      setBinError(`Bin ${val} is full (${bin.current_count}/${bin.capacity}). Try another bin.`)
      setBinLoading(false)
      return
    }

    // Store tote in bin
    await supabase.from('totes').update({
      status: 'stored',
      bin_location: val,
      last_scan_date: new Date().toISOString(),
    }).eq('id', scannedTote.id)

    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    setDoneInfo({ toteId: scannedTote.id, bin: val, time })
    setBinLoading(false)
    setQuickStowTote(null)
    setStep('done')
  }

  function reset() {
    setStep(1)
    setScannedTote(null)
    setToteError('')
    setBinError('')
    setToteScan('')
    setBinScan('')
    setDoneInfo(null)
    setQuickStowTote(null)
    loadUnstowed()
  }

  function startQuickStow(tote: UnstowedTote) {
    setQuickStowTote(tote)
    setScannedTote({ id: tote.id, sealNumber: tote.seal_number, customerName: tote.customerName, onManifest: true })
    setTab('receive')
    setStep(2)
  }

  // End-of-day cutoff
  const now = new Date()
  const cutoff = new Date()
  cutoff.setHours(18, 0, 0, 0)
  const minsLeft = Math.max(0, Math.floor((cutoff.getTime() - now.getTime()) / 60000))
  const hoursLeft = Math.floor(minsLeft / 60)
  const minsRemainder = minsLeft % 60
  const cutoffPassed = now > cutoff

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Scan &amp; Store</h1>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {(['receive', 'unstowed'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); reset() }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              tab === t ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500'
            }`}
          >
            {t === 'receive' ? 'Receive Tote' : 'Unstowed'}
            {t === 'unstowed' && unstowedTotes.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
                {unstowedTotes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── RECEIVE TAB ── */}
      {tab === 'receive' && (
        <>
          {/* Step indicator */}
          {step !== 'done' && (
            <div className="flex items-center gap-2">
              {[1, 2].map(s => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    (step as number) >= s ? 'bg-brand-navy text-white' : 'bg-gray-200 text-gray-400'
                  }`}>{s}</div>
                  <div className={`flex-1 h-1 rounded-full ${s === 1 ? ((step as number) >= 2 ? 'bg-brand-navy' : 'bg-gray-200') : 'hidden'}`} />
                </div>
              ))}
              <span className="text-xs text-gray-500 ml-1">
                {step === 1 ? 'Scan Tote' : 'Scan Bin'}
              </span>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-2xl px-5 py-4">
                <p className="text-xs font-bold text-brand-navy uppercase mb-1">Step 1</p>
                <p className="text-sm text-gray-600">Scan the tote barcode to identify it.</p>
              </div>
              <form onSubmit={handleToteScan} className="space-y-3">
                <div className="relative">
                  <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={toteScan}
                    onChange={e => { setToteScan(e.target.value); setToteError('') }}
                    placeholder="Scan tote barcode (e.g. TV-1001)"
                    className="input-field pl-11"
                  />
                </div>
                {toteError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{toteError}</p>
                  </div>
                )}
                <button type="submit" disabled={toteLoading} className="btn-primary w-full">
                  {toteLoading ? 'Looking up...' : 'Confirm Tote'}
                </button>
              </form>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && scannedTote && (
            <div className="space-y-4">
              {/* Tote confirmed card */}
              <div className={`rounded-2xl px-5 py-4 border-2 ${
                scannedTote.onManifest
                  ? 'bg-green-50 border-green-300'
                  : 'bg-amber-50 border-amber-300'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {scannedTote.onManifest ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  )}
                  <p className={`text-sm font-bold ${scannedTote.onManifest ? 'text-green-700' : 'text-amber-700'}`}>
                    {scannedTote.onManifest ? 'Tote on manifest' : 'NOT on manifest — proceed with caution'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tote ID</span>
                    <span className="font-bold font-mono text-brand-navy">{scannedTote.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Customer</span>
                    <span className="font-semibold text-brand-navy">{scannedTote.customerName}</span>
                  </div>
                  {scannedTote.sealNumber && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Seal</span>
                      <span className="font-semibold font-mono text-brand-navy">{scannedTote.sealNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-2xl px-5 py-4">
                <p className="text-xs font-bold text-brand-navy uppercase mb-1">Step 2</p>
                <p className="text-sm text-gray-600">Scan the bin barcode where you&apos;re placing this tote.</p>
              </div>

              <form onSubmit={handleBinScan} className="space-y-3">
                <div className="relative">
                  <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={binScan}
                    onChange={e => { setBinScan(e.target.value); setBinError('') }}
                    placeholder="Scan bin barcode (e.g. A-01)"
                    className="input-field pl-11"
                  />
                </div>
                {binError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{binError}</p>
                  </div>
                )}
                <button type="submit" disabled={binLoading} className="btn-primary w-full">
                  {binLoading ? 'Storing...' : 'Place in Bin'}
                </button>
              </form>

              <button onClick={() => { setStep(1); setScannedTote(null) }} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 font-semibold">
                ← Back to Tote Scan
              </button>
            </div>
          )}

          {/* Done */}
          {step === 'done' && doneInfo && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="font-black text-xl text-brand-navy">Tote Stowed!</h2>
              </div>
              <div className="card space-y-3">
                {[
                  { label: 'Tote ID', value: doneInfo.toteId },
                  { label: 'Bin', value: doneInfo.bin },
                  { label: 'Time', value: doneInfo.time },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-bold text-brand-navy font-mono">{value}</span>
                  </div>
                ))}
              </div>
              <button onClick={reset} className="btn-primary w-full">
                Scan Next Tote
              </button>
            </div>
          )}
        </>
      )}

      {/* ── UNSTOWED TAB ── */}
      {tab === 'unstowed' && (
        <div className="space-y-4">
          {/* Cutoff timer */}
          <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${
            cutoffPassed ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
          }`}>
            <Clock className={`w-5 h-5 flex-shrink-0 ${cutoffPassed ? 'text-red-500' : 'text-amber-600'}`} />
            <div>
              <p className={`text-sm font-bold ${cutoffPassed ? 'text-red-700' : 'text-amber-700'}`}>
                {cutoffPassed ? 'Past cutoff time (6:00 PM)' : `${hoursLeft}h ${minsRemainder}m until 6:00 PM cutoff`}
              </p>
              <p className={`text-xs ${cutoffPassed ? 'text-red-600' : 'text-amber-600'}`}>
                All totes should be stowed before end of day
              </p>
            </div>
          </div>

          {unstowedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
            </div>
          ) : unstowedTotes.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-bold text-gray-500 text-lg">All Totes Stowed</p>
              <p className="text-gray-400 text-sm mt-1">No unstowed totes at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unstowedTotes.map(t => (
                <div key={t.id} className="card space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-brand-navy text-sm font-mono">{t.id}</p>
                      <p className="text-xs text-gray-500">{t.customerName}</p>
                      {t.seal_number && <p className="text-xs text-gray-400">Seal: {t.seal_number}</p>}
                    </div>
                    <span className="status-pill bg-amber-100 text-amber-700 text-xs whitespace-nowrap">Unstowed</span>
                  </div>
                  <button
                    onClick={() => startQuickStow(t)}
                    className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-900 transition-colors"
                  >
                    Stow This Tote Now <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScanStorePage() {
  return (
    <Suspense fallback={<div className="px-5 pt-6"><div className="h-32 bg-gray-200 rounded-2xl animate-pulse" /></div>}>
      <ScanStoreContent />
    </Suspense>
  )
}
