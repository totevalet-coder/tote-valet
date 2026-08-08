'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Truck, Package, ArrowDownToLine, ArrowRight, Download, Printer, FileText, MoreHorizontal, Trash2 } from 'lucide-react'

type OrderType = 'empty_tote_delivery' | 'pickup' | 'full_tote_delivery'
type OrderStatus = 'pending' | 'en_route' | 'complete'

interface OrderRow {
  key: string
  source: 'tote_request' | 'pickup_flag'
  sourceId: string
  type: OrderType
  status: OrderStatus
  customerId: string
  customerName: string
  customerAddress: string | null
  toteIds: string[]
  quantity: number | null
  preferredDate: string | null
  // Date placed: tote_requests.created_at. Legacy pickup-flag orders (no
  // tote_requests row) have nowhere this is tracked — null for those.
  datePlaced: string | null
  // Date delivered: tote_requests.completed_at, set by the driver's
  // stop-completion flow once the linked route stop actually completes
  // (see order_ref on RouteStop). Null until then, and permanently null for
  // legacy pickup-flag orders (same gap as datePlaced).
  dateDelivered: string | null
  fullCount?: number
  emptyCount?: number
}

type DateField = 'placed' | 'preferred' | 'delivered'
const DATE_FIELD_LABEL: Record<DateField, string> = {
  placed: 'Date Placed', preferred: 'Preferred Date', delivered: 'Date Delivered',
}
// Consistent with the UTC-day convention used elsewhere in the app (Routes,
// Pick) — good enough given nothing here is timezone-critical.
function toUTCDateStr(iso: string | null): string | null {
  return iso ? iso.split('T')[0] : null
}
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_META: Record<OrderType, { label: string; icon: typeof Package; color: string }> = {
  empty_tote_delivery: { label: 'Empty Tote Delivery', icon: Package, color: 'bg-purple-100 text-purple-700' },
  pickup:              { label: 'Pickup',              icon: Truck, color: 'bg-blue-100 text-blue-700' },
  full_tote_delivery:  { label: 'Full Tote Delivery',  icon: ArrowDownToLine, color: 'bg-green-100 text-green-700' },
}

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700' },
  en_route: { label: 'En Route', color: 'bg-blue-100 text-blue-700' },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-700' },
}

// tote_requests.status in the DB is still 'pending' | 'acknowledged' | 'complete'
// (no schema change made for this) — 'acknowledged' is displayed as "En Route"
// since, post the auto-acknowledge fix, that's the only thing that ever sets it now.
function toOrderStatus(dbStatus: string): OrderStatus {
  if (dbStatus === 'acknowledged') return 'en_route'
  if (dbStatus === 'complete') return 'complete'
  return 'pending'
}

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createClient()

  const todayStr = new Date().toISOString().split('T')[0]
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  // Unlike Routes/Pick, Orders is a workqueue people expect to see in full
  // by default — so the date filter starts off ("All Dates") rather than
  // defaulting to Today.
  const [dateFilterOn, setDateFilterOn] = useState(false)
  const [dateField, setDateField] = useState<DateField>('placed')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showExport, setShowExport] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [pickupRes, requestsRes] = await Promise.all([
      supabase.from('totes').select('id, tote_name, customer_id, customers(name, address)').eq('pickup_requested', true),
      supabase.from('tote_requests')
        .select('id, type, quantity, tote_ids, preferred_date, customer_id, status, created_at, completed_at, customers(name, address)')
        .order('preferred_date', { ascending: true }),
    ])

    const rows: OrderRow[] = []

    const requests = (requestsRes.data ?? []) as { id: string; type: string; quantity: number | null; tote_ids: string[] | null; preferred_date: string | null; customer_id: string; status: string; created_at: string; completed_at: string | null; customers: { name: string; address: string | null } | null }[]
    for (const r of requests) {
      rows.push({
        key: `request-${r.id}`, source: 'tote_request', sourceId: r.id, type: r.type as OrderType, status: toOrderStatus(r.status),
        customerId: r.customer_id, customerName: r.customers?.name ?? 'Unknown', customerAddress: r.customers?.address ?? null,
        toteIds: r.tote_ids ?? [], quantity: r.quantity, preferredDate: r.preferred_date,
        datePlaced: r.created_at, dateDelivered: r.completed_at,
      })
    }

    // my-items' Request Pickup / Return Empties flows always write a
    // tote_requests row AND flip pickup_requested=true for the same totes in
    // one action — they're the same real-world event, not two independent
    // orders. Skip any flagged tote already covered by a tote_requests row so
    // it doesn't get double-counted; only genuinely orphaned flags (no
    // matching request — a pre-existing-data edge case, not something the
    // current flows produce) still show up via this legacy path, and since
    // there's no way to track "en route" for those without a schema change,
    // they always display as Pending.
    const requestedToteIds = new Set(requests.flatMap(r => r.tote_ids ?? []))
    for (const t of (pickupRes.data ?? []) as { id: string; tote_name: string | null; customer_id: string; customers: { name: string; address: string | null } | null }[]) {
      if (requestedToteIds.has(t.id)) continue
      rows.push({
        key: `pickup-flag-${t.id}`, source: 'pickup_flag', sourceId: t.id, type: 'pickup', status: 'pending',
        customerId: t.customer_id, customerName: t.customers?.name ?? 'Unknown', customerAddress: t.customers?.address ?? null,
        toteIds: [t.id], quantity: null, preferredDate: null,
        datePlaced: null, dateDelivered: null,
      })
    }

    // Derive full/empty split for 'pickup' orders live from each tote's current items
    const pickupToteIds = [...new Set(rows.filter(r => r.type === 'pickup').flatMap(r => r.toteIds))]
    if (pickupToteIds.length > 0) {
      const { data: itemsData } = await supabase.from('totes').select('id, items').in('id', pickupToteIds)
      const countByTote = new Map<string, number>((itemsData ?? []).map(t => [t.id, ((t.items as { label: string }[] | null) ?? []).length]))
      for (const row of rows) {
        if (row.type !== 'pickup') continue
        row.fullCount = row.toteIds.filter(id => (countByTote.get(id) ?? 0) > 0).length
        row.emptyCount = row.toteIds.filter(id => (countByTote.get(id) ?? 0) === 0).length
      }
    }

    setOrders(rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Type-count pills reflect pending workload only — an order that's already
  // en route isn't something still waiting to be handled.
  const typeCounts = useMemo(() => {
    const c: Record<OrderType, number> = { empty_tote_delivery: 0, pickup: 0, full_tote_delivery: 0 }
    for (const o of orders) if (o.status === 'pending') c[o.type]++
    return c
  }, [orders])
  const pendingPickups = orders.filter(o => o.type === 'pickup' && o.status === 'pending')

  const filtered = orders
    .filter(o => typeFilter === 'all' || o.type === typeFilter)
    .filter(o => statusFilter === 'all' || o.status === statusFilter)
    .filter(o => {
      if (!dateFilterOn) return true
      const value = dateField === 'preferred' ? o.preferredDate
        : dateField === 'placed' ? toUTCDateStr(o.datePlaced)
        : toUTCDateStr(o.dateDelivered)
      return value === selectedDate
    })

  function toggleSelect(key: string) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSelectAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(o => o.key)))
  }

  const selectedOrders = orders.filter(o => selected.has(o.key))

  function assignToRoute() {
    const stops = selectedOrders.map(o => ({
      customerId: o.customerId,
      toteIds: o.toteIds,
      type: o.type === 'pickup' ? 'pickup' as const : 'delivery' as const,
      // Carried through so the route builder can auto-acknowledge (-> En
      // Route) this order once the route actually saves, not before, since
      // the dispatcher can still edit or drop the stop up to that point.
      orderRef: { source: o.source, sourceId: o.sourceId },
      // Empty-tote-delivery orders don't have specific tote IDs yet — the
      // driver grabs generic empties and scans them at load time instead.
      // Carry the requested quantity through so the stop knows how many.
      expectedEmptyCount: (o.type === 'empty_tote_delivery' && o.toteIds.length === 0) ? (o.quantity ?? undefined) : undefined,
    }))
    const payload = JSON.stringify({ stops })
    if (payload.length < 1800) {
      router.push(`/admin/routes/new?prefill=${encodeURIComponent(payload)}`)
    } else {
      const key = `route-prefill-${Date.now()}`
      sessionStorage.setItem(key, payload)
      router.push(`/admin/routes/new?prefillKey=${key}`)
    }
  }

  // Bypasses normal flow entirely — matches "Force Unassign"/"Force
  // Complete" elsewhere in the app (admin override, no status restriction).
  // Permanently removes the order regardless of status (pending/en
  // route/complete); if it's already linked to a route stop, the stop
  // itself is untouched (order_ref just points at a now-missing row —
  // harmless, the stop-completion write-back simply matches zero rows).
  async function forceDeleteOrders(toDelete: OrderRow[]) {
    if (toDelete.length === 0) return
    const label = toDelete.length === 1
      ? `this ${TYPE_META[toDelete[0].type].label} order for ${toDelete[0].customerName}`
      : `these ${toDelete.length} orders`
    const confirmed = window.confirm(
      `Force delete ${label}? This permanently removes the order and cannot be undone. ` +
      `If it's already assigned to a route, the route stop itself is not affected — only the order record.`
    )
    if (!confirmed) return

    const requestIds = toDelete.filter(o => o.source === 'tote_request').map(o => o.sourceId)
    const pickupFlagIds = toDelete.filter(o => o.source === 'pickup_flag').map(o => o.sourceId)

    const [reqRes, flagRes] = await Promise.all([
      requestIds.length > 0 ? supabase.from('tote_requests').delete().in('id', requestIds) : Promise.resolve({ error: null }),
      // pickup_flag orders have no row of their own to delete — they're just
      // a flag on the tote. "Deleting" the order means clearing the flag.
      pickupFlagIds.length > 0 ? supabase.from('totes').update({ pickup_requested: false }).in('id', pickupFlagIds) : Promise.resolve({ error: null }),
    ])
    const err = reqRes.error ?? flagRes.error
    if (err) { alert(`Delete failed: ${err.message}`); return }

    const deletedKeys = new Set(toDelete.map(o => o.key))
    setOrders(prev => prev.filter(o => !deletedKeys.has(o.key)))
    setSelected(prev => {
      const n = new Set(prev)
      deletedKeys.forEach(k => n.delete(k))
      return n
    })
  }

  function exportCSV() {
    const rows = [['Type', 'Customer', 'Address', 'Totes', 'Date Placed', 'Preferred Date', 'Date Delivered', 'Status']]
    for (const o of selectedOrders.length > 0 ? selectedOrders : filtered) {
      rows.push([
        TYPE_META[o.type].label, o.customerName, o.customerAddress ?? '', String(o.toteIds.length || o.quantity || ''),
        toUTCDateStr(o.datePlaced) ?? '', o.preferredDate ?? '', toUTCDateStr(o.dateDelivered) ?? '', STATUS_META[o.status].label,
      ])
    }
    const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-black text-2xl text-brand-navy">Orders</h1>

        {/* Date filter — Orders has three distinct date concepts, so pick
            which one to filter by, then a normal date + Today/All control. */}
        <div className="flex items-center gap-2">
          <select
            value={dateField}
            onChange={e => setDateField(e.target.value as DateField)}
            disabled={!dateFilterOn}
            className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {(Object.keys(DATE_FIELD_LABEL) as DateField[]).map(f => (
              <option key={f} value={f}>{DATE_FIELD_LABEL[f]}</option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setDateFilterOn(true) }}
            disabled={!dateFilterOn}
            className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {dateFilterOn && selectedDate !== todayStr && (
            <button
              onClick={() => setSelectedDate(todayStr)}
              className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-500 hover:border-gray-300"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setDateFilterOn(v => !v)}
            className={`text-xs font-bold rounded-xl px-3 py-2.5 border-2 transition-colors ${!dateFilterOn ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 text-gray-500'}`}
          >
            All Dates
          </button>
        </div>
      </div>

      {/* Type-count pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${typeFilter === 'all' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          All Pending {Object.values(typeCounts).reduce((s, n) => s + n, 0)}
        </button>
        {(Object.keys(TYPE_META) as OrderType[]).map(t => {
          const meta = TYPE_META[t]
          const Icon = meta.icon
          const extra = t === 'pickup' && pendingPickups.length > 0
            ? ` (${pendingPickups.reduce((s, o) => s + (o.fullCount ?? 0), 0)} full, ${pendingPickups.reduce((s, o) => s + (o.emptyCount ?? 0), 0)} empty)`
            : ''
          return (
            <button
              key={t} onClick={() => setTypeFilter(t)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${typeFilter === t ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {meta.label}: {typeCounts[t]}{extra}
            </button>
          )
        })}
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {(['all', 'pending', 'en_route', 'complete'] as const).map(s => (
          <button
            key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {s === 'all' ? 'All Statuses' : STATUS_META[s].label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-brand-navy/5 border border-brand-navy/20 rounded-2xl px-4 py-3">
          <p className="text-sm font-bold text-brand-navy">{selected.size} selected</p>
          <button
            onClick={assignToRoute}
            className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-blue-900 transition-colors"
          >
            Assign to New Route <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => forceDeleteOrders(selectedOrders)}
            className="flex items-center gap-1.5 border-2 border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm font-bold hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Force Delete
          </button>
          <div className="relative ml-auto">
            <button onClick={() => setShowExport(v => !v)} className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-1.5">
                  <button onClick={exportCSV} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4" /> Export as CSV
                  </button>
                  <button onClick={() => { window.print(); setShowExport(false) }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Printer className="w-4 h-4" /> Print
                  </button>
                  <button disabled title="Not built yet" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed">
                    <FileText className="w-4 h-4" /> Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">
            No orders{dateFilterOn ? ` — ${DATE_FIELD_LABEL[dateField].toLowerCase()} ${selectedDate}` : ''}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleSelectAll} className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Totes</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Placed</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Preferred</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Delivered</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const meta = TYPE_META[o.type]
                  const Icon = meta.icon
                  const statusMeta = STATUS_META[o.status]
                  return (
                    <tr key={o.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(o.key)} onChange={() => toggleSelect(o.key)} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`status-pill text-[10px] flex items-center gap-1 w-fit ${meta.color}`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => router.push(`/admin/customers/${o.customerId}`)} className="font-semibold text-brand-navy hover:underline">
                          {o.customerName}
                        </button>
                        {o.customerAddress && <p className="text-xs text-gray-400">{o.customerAddress}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {o.toteIds.length || o.quantity || '—'}
                        {o.type === 'pickup' && o.fullCount !== undefined && (
                          <span className="text-xs text-gray-400"> ({o.fullCount} full, {o.emptyCount} empty)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(toUTCDateStr(o.datePlaced))}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(o.preferredDate)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(toUTCDateStr(o.dateDelivered))}</td>
                      <td className="px-4 py-3">
                        <span className={`status-pill text-[10px] ${statusMeta.color}`}>{statusMeta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => forceDeleteOrders([o])}
                          title="Force delete this order"
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
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
