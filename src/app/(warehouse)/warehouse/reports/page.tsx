'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ToteError } from '@/types/database'
import { Search, CheckCircle, AlertCircle, Package } from 'lucide-react'

type ReportTab = 'summary' | 'unstowed' | 'bins' | 'errors' | 'search'

interface SummaryStats {
  received: number
  stowed: number
  unstowed: number
  picksCompleted: number
  totesOut: number
  binUtilization: number
}

interface BinInfo {
  id: string
  row: string
  capacity: number
  current_count: number
}

function ReportsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [tab, setTab] = useState<ReportTab>((searchParams.get('tab') as ReportTab) ?? 'summary')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)

  // Summary
  const [summary, setSummary] = useState<SummaryStats | null>(null)

  // Unstowed
  const [unstowed, setUnstowed] = useState<{ id: string; customerName: string; seal: string | null }[]>([])

  // Bins
  const [bins, setBins] = useState<BinInfo[]>([])

  // Errors
  const [errors, setErrors] = useState<ToteError[]>([])

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; customer: string; status: string; bin: string | null; seal: string | null }[]>([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }

    const { data: cust } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    setUserRole(cust?.role ?? '')

    // Load all data in parallel
    const [totesRes, binsRes, pickListsRes, errorsRes] = await Promise.all([
      supabase.from('totes').select('id, status, bin_location, customer_id, seal_number'),
      supabase.from('bins').select('*').order('id'),
      supabase.from('pick_lists').select('status').eq('status', 'complete'),
      supabase.from('errors').select('*').eq('resolved', false).order('created_at', { ascending: false }),
    ])

    const totes = totesRes.data ?? []
    const binsData = binsRes.data ?? []

    // Summary stats
    const received = totes.filter(t => t.status === 'ready_to_stow' || t.status === 'stored').length
    const stowed = totes.filter(t => t.status === 'stored').length
    const unstowedCount = totes.filter(t => t.status === 'ready_to_stow').length
    const totesOut = totes.filter(t => ['empty_at_customer', 'in_transit', 'pending_pick', 'picked'].includes(t.status)).length
    const totalCap = binsData.reduce((s, b) => s + b.capacity, 0)
    const totalUsed = binsData.reduce((s, b) => s + b.current_count, 0)

    setSummary({
      received,
      stowed,
      unstowed: unstowedCount,
      picksCompleted: pickListsRes.data?.length ?? 0,
      totesOut,
      binUtilization: totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0,
    })

    // Unstowed list
    const unstowedTotes = totes.filter(t => t.status === 'ready_to_stow')
    const enriched = await Promise.all(unstowedTotes.map(async t => {
      const { data: c } = await supabase.from('customers').select('name').eq('id', t.customer_id).single()
      return { id: t.id, customerName: c?.name ?? 'Unknown', seal: t.seal_number }
    }))
    setUnstowed(enriched)

    setBins(binsData as BinInfo[])
    setErrors((errorsRes.data ?? []) as ToteError[])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    const q = searchQuery.trim()

    // Search totes by ID or seal
    const { data: toteMatches } = await supabase
      .from('totes')
      .select('id, status, bin_location, seal_number, customer_id')
      .or(`id.ilike.%${q}%,seal_number.ilike.%${q}%`)
      .limit(20)

    // Search by customer name
    const { data: custMatches } = await supabase
      .from('customers')
      .select('id, name')
      .ilike('name', `%${q}%`)
      .limit(10)

    const custIds = new Set(custMatches?.map(c => c.id) ?? [])
    const custNameMap = Object.fromEntries((custMatches ?? []).map(c => [c.id, c.name]))

    let results = [...(toteMatches ?? [])]

    if (custIds.size > 0) {
      const { data: custTotes } = await supabase
        .from('totes')
        .select('id, status, bin_location, seal_number, customer_id')
        .in('customer_id', [...custIds])
        .limit(20)
      results = [...results, ...(custTotes ?? [])]
    }

    // Deduplicate
    const seen = new Set<string>()
    const deduped = results.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })

    // Enrich with customer names
    const enriched = await Promise.all(deduped.map(async t => {
      const name = custNameMap[t.customer_id] ?? (await supabase.from('customers').select('name').eq('id', t.customer_id).single()).data?.name ?? 'Unknown'
      return { id: t.id, customer: name, status: t.status, bin: t.bin_location, seal: t.seal_number }
    }))

    setSearchResults(enriched)
    setSearching(false)
  }

  const TABS: { id: ReportTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'unstowed', label: 'Unstowed' },
    { id: 'bins', label: 'Bins' },
    ...(userRole === 'admin' ? [{ id: 'errors' as ReportTab, label: 'Errors' }] : []),
    { id: 'search', label: 'Search' },
  ]

  const STATUS_COLORS: Record<string, string> = {
    stored: 'bg-blue-100 text-blue-700',
    in_transit: 'bg-yellow-100 text-yellow-700',
    empty_at_customer: 'bg-gray-100 text-gray-600',
    ready_to_stow: 'bg-amber-100 text-amber-700',
    pending_pick: 'bg-orange-100 text-orange-700',
    picked: 'bg-indigo-100 text-indigo-700',
    error: 'bg-red-100 text-red-700',
  }

  function binColor(b: BinInfo) {
    const pct = b.capacity > 0 ? b.current_count / b.capacity : 0
    if (pct >= 0.9) return 'bg-red-100 border-red-300 text-red-700'
    if (pct >= 0.6) return 'bg-amber-100 border-amber-300 text-amber-700'
    return 'bg-green-100 border-green-300 text-green-700'
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Reports</h1>

      {/* Tab pills — scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 ${
              tab === t.id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {tab === 'summary' && summary && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 font-semibold">Today&apos;s Activity</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Totes Received', value: summary.received, emoji: '📥' },
              { label: 'Totes Stowed', value: summary.stowed, emoji: '✅' },
              { label: 'Still Unstowed', value: summary.unstowed, emoji: '⚠️' },
              { label: 'Picks Completed', value: summary.picksCompleted, emoji: '📋' },
              { label: 'Totes Out', value: summary.totesOut, emoji: '🚐' },
            ].map(({ label, value, emoji }) => (
              <div key={label} className="card text-center py-4">
                <span className="text-2xl">{emoji}</span>
                <p className="font-black text-3xl mt-1 text-brand-navy">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
            <div className="card text-center py-4">
              <span className="text-2xl">🏢</span>
              <p className="font-black text-3xl mt-1 text-brand-navy">{summary.binUtilization}%</p>
              <p className="text-xs text-gray-500 mt-1">Bin Utilization</p>
            </div>
          </div>
        </div>
      )}

      {/* ── UNSTOWED ── */}
      {tab === 'unstowed' && (
        <div className="space-y-3">
          {unstowed.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-bold text-gray-400 text-lg">All Totes Stowed</p>
            </div>
          ) : (
            unstowed.map(t => (
              <div key={t.id} className="card flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <Package className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm font-mono text-brand-navy">{t.id}</p>
                  <p className="text-xs text-gray-500">{t.customerName}{t.seal ? ` · Seal: ${t.seal}` : ''}</p>
                </div>
                <span className="status-pill bg-amber-100 text-amber-700 text-xs">Unstowed</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BINS ── */}
      {tab === 'bins' && (
        <div className="space-y-4">
          {/* Row groups */}
          {['A', 'B', 'C'].map(row => {
            const rowBins = bins.filter(b => b.row === row)
            if (rowBins.length === 0) return null
            return (
              <div key={row}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Row {row}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {rowBins.map(b => {
                    const pct = b.capacity > 0 ? Math.round((b.current_count / b.capacity) * 100) : 0
                    return (
                      <div key={b.id} className={`rounded-xl border-2 px-3 py-3 text-center ${binColor(b)}`}>
                        <p className="font-black text-sm">{b.id}</p>
                        <p className="text-xs font-semibold mt-0.5">{b.current_count}/{b.capacity}</p>
                        <div className="h-1.5 bg-black/10 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-current rounded-full opacity-50" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {bins.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No bins configured. Add bins in the database.</p>
          )}
          {/* Legend */}
          <div className="flex gap-4 justify-center pt-2">
            {[
              { color: 'bg-green-200', label: '< 60%' },
              { color: 'bg-amber-200', label: '60–90%' },
              { color: 'bg-red-200', label: '> 90%' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ERRORS (Admin only) ── */}
      {tab === 'errors' && (
        <div className="space-y-3">
          {errors.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-bold text-gray-400 text-lg">No Unresolved Errors</p>
            </div>
          ) : (
            errors.map(err => (
              <div key={err.id} className="card border-l-4 border-red-400 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="font-bold text-red-700 text-sm">{err.id}</span>
                  <span className="status-pill bg-red-100 text-red-700 text-xs ml-auto">{err.type.replace('_', ' ')}</span>
                </div>
                {err.stop_info && <p className="text-xs text-gray-600">{err.stop_info}</p>}
                {err.detail && <p className="text-xs text-gray-500">{err.detail}</p>}
                {err.error_code && (
                  <p className="text-xs font-mono font-bold text-orange-700">{err.error_code}</p>
                )}
                {err.driver_notes && (
                  <p className="text-xs text-gray-500">Driver notes: {err.driver_notes}</p>
                )}
                <p className="text-xs text-gray-400">{new Date(err.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── SEARCH ── */}
      {tab === 'search' && (
        <div className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tote ID, customer name, seal..."
                className="input-field pl-10"
              />
            </div>
            <button type="submit" disabled={searching} className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm">
              {searching ? '...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map(t => (
                <div key={t.id} className="card space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-brand-navy text-sm">{t.id}</span>
                    <span className={`status-pill text-xs ml-auto ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{t.customer}</p>
                  <div className="flex gap-4 text-xs text-gray-400">
                    {t.bin && <span>Bin: <span className="font-mono font-semibold text-brand-navy">{t.bin}</span></span>}
                    {t.seal && <span>Seal: <span className="font-mono">{t.seal}</span></span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-center text-gray-400 text-sm py-8">No results found for &quot;{searchQuery}&quot;</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="px-5 pt-6"><div className="h-32 bg-gray-200 rounded-2xl animate-pulse" /></div>}>
      <ReportsContent />
    </Suspense>
  )
}
