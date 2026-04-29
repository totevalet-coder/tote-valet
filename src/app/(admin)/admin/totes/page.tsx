'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ToteStatus } from '@/types/database'
import { Package, Search, ChevronRight, AlertCircle, X } from 'lucide-react'

interface ToteRow {
  id: string
  status: ToteStatus
  tote_name: string | null
  bin_location: string | null
  seal_number: string | null
  last_scan_date: string | null
  customer_id: string
  customerName: string
}

const STATUS_META: Record<ToteStatus, { label: string; color: string; dot: string }> = {
  stored:              { label: 'Stored',           color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  empty_at_customer:   { label: 'At Customer',      color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  in_transit:          { label: 'In Transit',       color: 'bg-yellow-100 text-yellow-700',dot: 'bg-yellow-500' },
  ready_to_stow:       { label: 'Ready to Stow',    color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  pending_pick:        { label: 'Pending Pick',     color: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500' },
  picked:              { label: 'Picked',           color: 'bg-indigo-100 text-indigo-700',dot: 'bg-indigo-500' },
  returned_to_station: { label: 'At Station',       color: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500' },
  error:               { label: 'Error',            color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
}

const ALL_STATUSES = Object.keys(STATUS_META) as ToteStatus[]

export default function AdminTotesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [totes, setTotes] = useState<ToteRow[]>([])
  const [filtered, setFiltered] = useState<ToteRow[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<ToteStatus | 'all'>('all')

  // Status counts
  const [counts, setCounts] = useState<Partial<Record<ToteStatus | 'all', number>>>({})

  const load = useCallback(async () => {
    setLoading(true)

    const { data: toteData } = await supabase
      .from('totes')
      .select('id, status, tote_name, bin_location, seal_number, last_scan_date, customer_id')
      .order('status')
      .order('id')

    if (!toteData) { setLoading(false); return }

    // Get all unique customer IDs
    const custIds = [...new Set(toteData.map(t => t.customer_id))]
    const { data: custData } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', custIds)

    const nameMap: Record<string, string> = {}
    ;(custData ?? []).forEach(c => { nameMap[c.id] = c.name })

    const rows: ToteRow[] = toteData.map(t => ({
      ...t,
      status: t.status as ToteStatus,
      customerName: nameMap[t.customer_id] ?? 'Unknown',
    }))

    // Build counts
    const c: Partial<Record<ToteStatus | 'all', number>> = { all: rows.length }
    for (const s of ALL_STATUSES) {
      c[s] = rows.filter(t => t.status === s).length
    }

    setTotes(rows)
    setFiltered(rows)
    setCounts(c)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Filter whenever query or status changes
  useEffect(() => {
    let result = totes
    if (activeStatus !== 'all') {
      result = result.filter(t => t.status === activeStatus)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(t =>
        t.id.toLowerCase().includes(q) ||
        (t.tote_name ?? '').toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        (t.bin_location ?? '').toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [query, activeStatus, totes])

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="pb-6 space-y-0">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-2xl text-brand-navy">Tote Inventory</h1>
            <p className="text-xs text-gray-400 mt-0.5">{counts.all ?? 0} totes total</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by ID, name, customer, bin…"
            className="input-field pl-10 pr-10"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Status filter pills — horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-hide">
          <button
            onClick={() => setActiveStatus('all')}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
              activeStatus === 'all'
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            All <span className="opacity-70">{counts.all ?? 0}</span>
          </button>
          {ALL_STATUSES.filter(s => (counts[s] ?? 0) > 0).map(s => {
            const meta = STATUS_META[s]
            return (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                  activeStatus === s
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeStatus === s ? 'bg-white' : meta.dot}`} />
                {meta.label}
                <span className="opacity-70">{counts[s] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="px-5 space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-5">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No totes found</p>
          {query && <p className="text-gray-400 text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="px-5 space-y-2">
          {/* Result count */}
          {(query || activeStatus !== 'all') && (
            <p className="text-xs text-gray-400 pb-1">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {activeStatus !== 'all' && ` · ${STATUS_META[activeStatus].label}`}
            </p>
          )}

          {filtered.map(t => {
            const meta = STATUS_META[t.status]
            return (
              <button
                key={t.id}
                onClick={() => router.push(`/admin/customers/${t.customer_id}`)}
                className="w-full card text-left flex items-center gap-3 hover:shadow-md transition-shadow"
              >
                {/* Status dot */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  t.status === 'error' ? 'bg-red-100' :
                  t.status === 'stored' ? 'bg-blue-100' :
                  t.status === 'in_transit' ? 'bg-yellow-100' :
                  t.status === 'ready_to_stow' ? 'bg-purple-100' : 'bg-gray-100'
                }`}>
                  {t.status === 'error'
                    ? <AlertCircle className="w-5 h-5 text-red-500" />
                    : <Package className={`w-5 h-5 ${
                        t.status === 'stored' ? 'text-blue-500' :
                        t.status === 'in_transit' ? 'text-yellow-600' :
                        t.status === 'ready_to_stow' ? 'text-purple-500' : 'text-gray-400'
                      }`} />
                  }
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  {/* Row 1: ID + status pill */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-brand-navy text-sm font-mono">{t.id}</span>
                    <span className={`status-pill text-[10px] ${meta.color}`}>{meta.label}</span>
                  </div>
                  {/* Row 2: name + customer */}
                  <p className="text-xs text-gray-600 truncate">
                    {t.tote_name ? <span className="font-semibold">{t.tote_name}</span> : <span className="text-gray-400 italic">Unnamed</span>}
                    {' · '}{t.customerName}
                  </p>
                  {/* Row 3: bin + last scan */}
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    {t.bin_location && (
                      <span className="font-mono font-semibold text-brand-navy bg-gray-100 rounded px-1.5 py-0.5">
                        {t.bin_location}
                      </span>
                    )}
                    {t.last_scan_date && (
                      <span>Last scan: {formatDate(t.last_scan_date)}</span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
