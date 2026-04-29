'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/types/database'
import {
  DollarSign, AlertTriangle, Package, Loader2, CheckCircle2,
  RefreshCw, Warehouse
} from 'lucide-react'
import { calcMonthlyTotal, MISSING_TOTE_CHARGE, formatCurrency } from '@/lib/billing'

type BillingTab = 'summary' | 'by-customer' | 'failed' | 'missing-totes'

interface MissingTote {
  id: string
  tote_name: string | null
  status: string
  customer_id: string
  customerName: string
}

function BillingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [tab, setTab] = useState<BillingTab>((searchParams.get('tab') as BillingTab) ?? 'summary')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [missingTotes, setMissingTotes] = useState<MissingTote[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [charging, setCharging] = useState<Record<string, boolean>>({})
  const [chargeResults, setChargeResults] = useState<Record<string, { ok: boolean; msg: string }>>({})

  async function chargeCustomer(customerId: string) {
    setCharging(prev => ({ ...prev, [customerId]: true }))
    setChargeResults(prev => { const n = { ...prev }; delete n[customerId]; return n })
    const res = await fetch('/api/stripe/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    })
    const data = await res.json()
    setChargeResults(prev => ({
      ...prev,
      [customerId]: { ok: res.ok, msg: res.ok ? 'Charged successfully' : (data.error ?? 'Charge failed') },
    }))
    setCharging(prev => ({ ...prev, [customerId]: false }))
    if (res.ok) load()
  }

  const load = useCallback(async () => {
    const [custRes, suspendedRes] = await Promise.all([
      supabase.from('customers').select('*').eq('role', 'customer').order('name'),
      supabase
        .from('customers')
        .select('id, name, totes(id, tote_name, status)')
        .eq('role', 'customer')
        .eq('status', 'suspended'),
    ])

    setCustomers((custRes.data ?? []) as Customer[])

    // Build missing totes list: totes from suspended customers not safely in warehouse
    const safe = new Set(['stored', 'pending_pick', 'picked'])
    const missing: MissingTote[] = []
    for (const c of (suspendedRes.data ?? []) as { id: string; name: string; totes: { id: string; tote_name: string | null; status: string }[] }[]) {
      for (const t of (c.totes ?? [])) {
        if (!safe.has(t.status)) {
          missing.push({ id: t.id, tote_name: t.tote_name, status: t.status, customer_id: c.id, customerName: c.name })
        }
      }
    }
    setMissingTotes(missing)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Sync Monthly Totals ────────────────────────────────────────────────────
  async function syncMonthlyTotals() {
    setSyncing(true)
    setSyncResult(null)

    // Load all totes in one query
    const { data: allTotes } = await supabase.from('totes').select('customer_id, status')
    if (!allTotes) { setSyncing(false); return }

    // Group by customer
    const byCustomer: Record<string, { status: string }[]> = {}
    for (const t of allTotes) {
      if (!byCustomer[t.customer_id]) byCustomer[t.customer_id] = []
      byCustomer[t.customer_id].push({ status: t.status })
    }

    // Update each customer
    let updated = 0
    for (const [customerId, totes] of Object.entries(byCustomer)) {
      const total = calcMonthlyTotal(totes)
      await supabase.from('customers').update({ monthly_total: total }).eq('id', customerId)
      updated++
    }

    await load()
    setSyncResult(`${updated} customer${updated !== 1 ? 's' : ''} updated`)
    setSyncing(false)
  }

  const activeCustomers = customers.filter(c => c.status === 'active')
  const failedCustomers = customers.filter(c => c.status === 'failed_payment')
  const mrr = activeCustomers.reduce((s, c) => s + (c.monthly_total ?? 0), 0)
  const uncollected = failedCustomers.reduce((s, c) => s + (c.monthly_total ?? 0), 0)

  const TABS: { id: BillingTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'by-customer', label: 'By Customer' },
    { id: 'failed', label: `Failed (${failedCustomers.length})` },
    { id: 'missing-totes', label: `Missing (${missingTotes.length})` },
  ]

  async function reactivate(customerId: string) {
    await supabase.from('customers').update({ status: 'active' }).eq('id', customerId)
    load()
  }

  async function suspend(customerId: string) {
    if (!confirm('Suspend this account?')) return
    await supabase.from('customers').update({ status: 'suspended' }).eq('id', customerId)
    load()
  }

  if (loading) return <div className="px-5 pt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Billing</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all ${tab === t.id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Monthly Revenue', value: formatCurrency(mrr), emoji: '💰', color: 'text-green-600' },
              { label: 'Active Customers', value: activeCustomers.length, emoji: '👥', color: 'text-brand-navy' },
              { label: 'Uncollected', value: formatCurrency(uncollected), emoji: '⚠️', color: uncollected > 0 ? 'text-red-600' : 'text-gray-400' },
              { label: 'Failed Payments', value: failedCustomers.length, emoji: '❌', color: failedCustomers.length > 0 ? 'text-red-600' : 'text-gray-400' },
            ].map(({ label, value, emoji, color }) => (
              <div key={label} className="card text-center py-4">
                <span className="text-2xl">{emoji}</span>
                <p className={`font-black text-2xl mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* MRR bar by month — placeholder */}
          <div className="card">
            <p className="text-sm font-bold text-brand-navy mb-3">MRR Trend</p>
            <div className="flex items-end gap-2 h-20">
              {[65, 72, 68, 80, 85, mrr > 0 ? Math.min(100, (mrr / 500) * 100) : 88].map((h, i) => (
                <div key={i} className="flex-1 bg-brand-blue/20 rounded-t-lg relative" style={{ height: `${h}%` }}>
                  {i === 5 && <div className="absolute inset-0 bg-brand-blue rounded-t-lg" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              {['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'].map(m => <span key={m}>{m}</span>)}
            </div>
          </div>

          {/* Sync monthly totals */}
          <div className="card space-y-3">
            <div>
              <p className="text-sm font-bold text-brand-navy">Sync Monthly Totals</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Recalculates each customer's monthly_total from their actual totes.
                Run this after deliveries or pickups to keep billing accurate.
              </p>
            </div>
            {syncResult && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {syncResult}
              </div>
            )}
            <button
              onClick={syncMonthlyTotals}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 border-2 border-brand-blue text-brand-blue rounded-xl py-3 text-sm font-bold hover:bg-blue-50 transition-colors disabled:opacity-60"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Syncing…' : 'Sync Monthly Totals'}
            </button>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 border-2 border-brand-blue text-brand-blue rounded-xl py-3 text-sm font-bold hover:bg-blue-50 transition-colors">
              Export CSV
            </button>
            <button className="flex-1 border-2 border-brand-navy text-brand-navy rounded-xl py-3 text-sm font-bold hover:bg-gray-50 transition-colors">
              Email Invoices
            </button>
          </div>
        </div>
      )}

      {/* By Customer */}
      {tab === 'by-customer' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            Based on current tote statuses. Use Sync Monthly Totals to refresh.
          </p>
          {activeCustomers.map(c => (
            <button key={c.id} onClick={() => router.push(`/admin/customers/${c.id}`)}
              className="card w-full text-left space-y-2 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <p className="font-bold text-brand-navy text-sm">{c.name}</p>
                <p className="font-black text-brand-navy">{formatCurrency(c.monthly_total ?? 0)}</p>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Monthly storage</span>
                <span>{formatCurrency(c.monthly_total ?? 0)}/mo</span>
              </div>
            </button>
          ))}
          {activeCustomers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 font-bold">No active customers</p>
            </div>
          )}
        </div>
      )}

      {/* Failed Payments */}
      {tab === 'failed' && (
        <div className="space-y-3">
          {failedCustomers.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-bold text-gray-400">No Failed Payments</p>
            </div>
          ) : failedCustomers.map(c => (
            <div key={c.id} className="card border-l-4 border-red-400 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="font-bold text-brand-navy text-sm">{c.name}</p>
                <span className="ml-auto font-bold text-red-600">{formatCurrency(c.monthly_total ?? 0)}</span>
              </div>
              <p className="text-xs text-gray-500">{c.email}</p>
              {chargeResults[c.id] && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${chargeResults[c.id].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {chargeResults[c.id].ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {chargeResults[c.id].msg}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => chargeCustomer(c.id)} disabled={charging[c.id]}
                  className="flex-1 bg-brand-blue text-white rounded-xl py-2 text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 disabled:opacity-60">
                  {charging[c.id] && <Loader2 className="w-3 h-3 animate-spin" />}
                  Charge Now
                </button>
                <button onClick={() => suspend(c.id)}
                  className="flex-1 border-2 border-red-300 text-red-600 rounded-xl py-2 text-xs font-bold hover:bg-red-50 transition-colors">
                  Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing Totes */}
      {tab === 'missing-totes' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Totes belonging to suspended accounts that are not in the warehouse.
            A {formatCurrency(MISSING_TOTE_CHARGE)} replacement charge applies if not returned.
          </p>
          {missingTotes.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Warehouse className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="font-bold text-gray-400">No Missing Totes</p>
              <p className="text-xs text-gray-400">All totes from suspended accounts are accounted for.</p>
            </div>
          ) : missingTotes.map(t => (
            <div key={t.id} className="card border-l-4 border-orange-400 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm">{t.customerName}</p>
                  <p className="text-xs text-gray-500 font-mono">{t.tote_name ? `${t.tote_name} · ` : ''}{t.id}</p>
                  <p className="text-xs text-orange-600 font-semibold mt-0.5 capitalize">{t.status.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-sm font-black text-orange-700">{formatCurrency(MISSING_TOTE_CHARGE)}</span>
              </div>
              <button
                onClick={() => router.push(`/admin/customers/${t.customer_id}`)}
                className="w-full bg-brand-navy text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-900 transition-colors"
              >
                View Account
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="px-5 pt-6"><div className="h-32 bg-gray-200 rounded-2xl animate-pulse" /></div>}>
      <BillingContent />
    </Suspense>
  )
}
