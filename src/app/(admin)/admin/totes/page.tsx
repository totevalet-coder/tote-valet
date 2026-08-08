'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ToteStatus, ToteItem } from '@/types/database'
import { Package, Search, ChevronRight, AlertCircle, X, Warehouse, Truck, ClipboardList, Flag } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'

interface ToteRow {
  id: string
  status: ToteStatus
  tote_name: string | null
  bin_location: string | null
  seal_number: string | null
  last_scan_date: string | null
  customer_id: string
  items: ToteItem[] | null
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
  const [binStats, setBinStats] = useState({ empty: 0, total: 0, locations: 0 })

  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<ToteStatus | 'all'>('all')

  const [counts, setCounts] = useState<Partial<Record<ToteStatus | 'all', number>>>({})

  const load = useCallback(async () => {
    setLoading(true)

    const [toteRes, binsRes] = await Promise.all([
      supabase.from('totes')
        .select('id, status, tote_name, bin_location, seal_number, last_scan_date, customer_id, items')
        .order('status').order('id'),
      supabase.from('bins').select('capacity, current_count'),
    ])

    const toteData = toteRes.data
    if (!toteData) { setLoading(false); return }

    const bins = binsRes.data ?? []
    const totalCap = bins.reduce((s, b) => s + b.capacity, 0)
    const used = bins.reduce((s, b) => s + b.current_count, 0)
    setBinStats({ empty: totalCap - used, total: totalCap, locations: bins.length })

    const custIds = [...new Set(toteData.map(t => t.customer_id))]
    const { data: custData } = await supabase.from('customers').select('id, name').in('id', custIds)
    const nameMap: Record<string, string> = {}
    ;(custData ?? []).forEach(c => { nameMap[c.id] = c.name })

    const rows: ToteRow[] = toteData.map(t => ({
      ...t,
      status: t.status as ToteStatus,
      customerName: nameMap[t.customer_id] ?? 'Unknown',
    }))

    const c: Partial<Record<ToteStatus | 'all', number>> = { all: rows.length }
    for (const s of ALL_STATUSES) c[s] = rows.filter(t => t.status === s).length

    setTotes(rows)
    setFiltered(rows)
    setCounts(c)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = totes
    if (activeStatus !== 'all') result = result.filter(t => t.status === activeStatus)
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

  const atCustomer = totes.filter(t => t.status === 'empty_at_customer')
  const atCustomerFull = atCustomer.filter(t => (t.items?.length ?? 0) > 0).length
  const atCustomerEmpty = atCustomer.length - atCustomerFull
  const pickupPipeline = (counts.pending_pick ?? 0) + (counts.picked ?? 0)
  const flagged = counts.error ?? 0

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h1 className="font-black text-2xl text-brand-navy">Inventory</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Warehouse" value={counts.stored ?? 0} subtext="In bins or awaiting placement" icon={Warehouse} />
        <StatCard label="At Customer" value={atCustomerFull} subtext={`Full · ${atCustomerEmpty} empty`} icon={Package} />
        <StatCard
          label="Bin Capacity" value={binStats.empty} total={binStats.total}
          subtext={`Empty · across ${binStats.locations} bin locations`} icon={Warehouse}
        />
        <div className="grid grid-cols-2 gap-4 col-span-2 lg:col-span-1">
          <StatCard label="In Transit" value={counts.in_transit ?? 0} icon={Truck} linkLabel="Inbound" linkHref="/admin/inbound" />
          <StatCard label="Pickup Pipeline" value={pickupPipeline} icon={ClipboardList} linkLabel="Pick" linkHref="/admin/pick-lists" />
        </div>
        <StatCard label="Flagged" value={flagged} icon={Flag} valueColor={flagged > 0 ? 'text-red-600' : 'text-brand-navy'} linkLabel="Errors" linkHref="/admin/errors" />
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by ID, name, customer, bin…"
            className="input-field pl-10 pr-10"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveStatus('all')}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
              activeStatus === 'all' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            All <span className="opacity-70">{counts.all ?? 0}</span>
          </button>
          {ALL_STATUSES.filter(s => (counts[s] ?? 0) > 0).map(s => {
            const meta = STATUS_META[s]
            return (
              <button
                key={s} onClick={() => setActiveStatus(s)}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                  activeStatus === s ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeStatus === s ? 'bg-white' : meta.dot}`} />
                {meta.label} <span className="opacity-70">{counts[s] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No totes found</p>
          {query && <p className="text-gray-400 text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Tote</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Location</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Contents</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Last Scan</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const meta = STATUS_META[t.status]
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/admin/customers/${t.customer_id}`)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-brand-navy whitespace-nowrap">
                        {t.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500 inline mr-1.5" />}
                        {t.id}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.tote_name || <span className="text-gray-300 italic">Unnamed</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{t.customerName}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {t.bin_location ? (
                          <span className="font-semibold text-brand-navy bg-gray-100 rounded px-1.5 py-0.5">{t.bin_location}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(t.items?.length ?? 0) > 0 ? (
                          <span className="status-pill text-[10px] bg-blue-100 text-blue-700">Full ({t.items!.length})</span>
                        ) : (
                          <span className="status-pill text-[10px] bg-gray-100 text-gray-500">Empty</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(t.last_scan_date) ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`status-pill text-[10px] whitespace-nowrap ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
