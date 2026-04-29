'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AlertTriangle, CreditCard, Package, ClipboardList,
  Loader2, CheckCircle2, Truck, Users, Warehouse,
  Radio, Navigation, ArrowRight, Bell
} from 'lucide-react'

interface AdminStats {
  mrr: number
  activeCustomers: number
  storedTotes: number
  emptyAtCustomer: number
  inTransit: number
  readyToStow: number
  failedPayments: number
  driverErrors: number
  routesActive: number
  routesTotal: number
  pendingRequests: number
}

export default function AdminHomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/login'); return }
    const { data: me } = await supabase.from('customers').select('role').eq('auth_id', userData.user.id).single()
    if (!me || me.role !== 'admin') { router.push('/dashboard'); return }

    const today = new Date().toISOString().split('T')[0]

    const [totesRes, customersRes, routesRes, errorsRes, requestsRes, pickupFlagsRes] = await Promise.all([
      supabase.from('totes').select('status'),
      supabase.from('customers').select('status, monthly_total, role'),
      supabase.from('routes').select('status').eq('date', today),
      supabase.from('errors').select('id', { count: 'exact', head: true }).eq('resolved', false),
      supabase.from('tote_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('totes').select('id', { count: 'exact', head: true }).eq('pickup_requested', true),
    ])

    const totes = totesRes.data ?? []
    const customers = customersRes.data ?? []
    const routes = routesRes.data ?? []

    setStats({
      mrr: customers.filter(c => c.role === 'customer').reduce((s, c) => s + (c.monthly_total ?? 0), 0),
      activeCustomers: customers.filter(c => c.role === 'customer' && c.status === 'active').length,
      storedTotes: totes.filter(t => t.status === 'stored').length,
      emptyAtCustomer: totes.filter(t => t.status === 'empty_at_customer').length,
      inTransit: totes.filter(t => t.status === 'in_transit').length,
      readyToStow: totes.filter(t => t.status === 'ready_to_stow').length,
      failedPayments: customers.filter(c => c.status === 'failed_payment').length,
      driverErrors: errorsRes.count ?? 0,
      routesActive: routes.filter(r => r.status === 'in_progress' || r.status === 'returning').length,
      routesTotal: routes.length,
      pendingRequests: (requestsRes.count ?? 0) + (pickupFlagsRes.count ?? 0),
    })
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  async function generatePickList() {
    setGenerating(true)
    setGeneratedId(null)

    const { data: totes } = await supabase
      .from('totes').select('id, bin_location, customer_id').eq('status', 'pending_pick')

    if (!totes || totes.length === 0) {
      alert('No totes are currently pending pick.')
      setGenerating(false)
      return
    }

    const customerIds = [...new Set(totes.map(t => t.customer_id))]
    const { data: customers } = await supabase.from('customers').select('id, name').in('id', customerIds)
    const nameMap: Record<string, string> = {}
    ;(customers ?? []).forEach(c => { nameMap[c.id] = c.name })

    const binMap: Record<string, { tote_id: string; customer_name: string; status: string }[]> = {}
    for (const tote of totes) {
      const bin = tote.bin_location ?? 'UNASSIGNED'
      if (!binMap[bin]) binMap[bin] = []
      binMap[bin].push({ tote_id: tote.id, customer_name: nameMap[tote.customer_id] ?? '', status: 'pending' })
    }

    const now = new Date()
    const year = now.getFullYear()
    const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 0).getTime()) / 86400000)
    const baseId = `PL-${year}-${String(dayOfYear).padStart(3, '0')}`
    const { data: existing } = await supabase.from('pick_lists').select('id').eq('id', baseId).maybeSingle()
    const id = existing ? `${baseId}-B` : baseId

    const bins = Object.entries(binMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bin_id, toteList]) => ({ bin_id, totes: toteList }))

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('pick_lists').insert({
      id,
      generated_by: userData.user?.id ?? 'admin',
      generated_at: now.toISOString(),
      status: 'ready',
      assigned_to: null,
      bins,
      completed_at: null,
    })

    if (!error) { setGeneratedId(id); load() }
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!stats) return null

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">

      {/* Date greeting */}
      <div>
        <p className="text-xs text-gray-400 font-medium">{today}</p>
        <h1 className="font-black text-2xl text-brand-navy">Overview</h1>
      </div>

      {/* Alert banners — only show when action needed */}
      {(stats.driverErrors > 0 || stats.failedPayments > 0 || stats.pendingRequests > 0 || stats.readyToStow > 0) && (
        <div className="space-y-2">
          {stats.driverErrors > 0 && (
            <button onClick={() => router.push('/admin/errors')}
              className="w-full flex items-center gap-3 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 text-left hover:bg-red-100 transition-colors">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="flex-1 text-sm font-bold text-red-800">
                {stats.driverErrors} driver error{stats.driverErrors !== 1 ? 's' : ''} need review
              </p>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </button>
          )}
          {stats.failedPayments > 0 && (
            <button onClick={() => router.push('/admin/billing')}
              className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 transition-colors">
              <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="flex-1 text-sm font-bold text-amber-800">
                {stats.failedPayments} failed payment{stats.failedPayments !== 1 ? 's' : ''}
              </p>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </button>
          )}
          {stats.pendingRequests > 0 && (
            <button onClick={() => router.push('/admin/requests')}
              className="w-full flex items-center gap-3 bg-blue-50 border border-blue-300 rounded-2xl px-4 py-3 text-left hover:bg-blue-100 transition-colors">
              <Bell className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="flex-1 text-sm font-bold text-blue-800">
                {stats.pendingRequests} customer request{stats.pendingRequests !== 1 ? 's' : ''} pending
              </p>
              <ArrowRight className="w-4 h-4 text-blue-400" />
            </button>
          )}
          {stats.readyToStow > 0 && (
            <button onClick={() => router.push('/warehouse/scan-store?tab=unstowed')}
              className="w-full flex items-center gap-3 bg-purple-50 border border-purple-300 rounded-2xl px-4 py-3 text-left hover:bg-purple-100 transition-colors">
              <Package className="w-5 h-5 text-purple-600 flex-shrink-0" />
              <p className="flex-1 text-sm font-bold text-purple-800">
                {stats.readyToStow} tote{stats.readyToStow !== 1 ? 's' : ''} ready to stow
              </p>
              <ArrowRight className="w-4 h-4 text-purple-400" />
            </button>
          )}
        </div>
      )}

      {/* Business metrics — all tappable */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Business</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => router.push('/admin/billing')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <span className="text-2xl">💰</span>
            <p className="font-black text-2xl mt-1 text-green-600">${stats.mrr.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">Monthly Revenue</p>
          </button>
          <button onClick={() => router.push('/admin/customers')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Users className="w-7 h-7 text-brand-blue mx-auto" />
            <p className="font-black text-2xl mt-1 text-brand-navy">{stats.activeCustomers}</p>
            <p className="text-xs text-gray-500 mt-1">Active Customers</p>
          </button>
        </div>
      </section>

      {/* Tote status — all tappable */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Totes</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => router.push('/admin/totes?status=stored')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Warehouse className="w-7 h-7 text-brand-blue mx-auto" />
            <p className="font-black text-2xl mt-1 text-brand-navy">{stats.storedTotes}</p>
            <p className="text-xs text-gray-500 mt-1">Stored in Warehouse</p>
          </button>
          <button onClick={() => router.push('/admin/totes?status=empty_at_customer')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Package className="w-7 h-7 text-gray-400 mx-auto" />
            <p className="font-black text-2xl mt-1 text-gray-600">{stats.emptyAtCustomer}</p>
            <p className="text-xs text-gray-500 mt-1">At Customer</p>
          </button>
          <button onClick={() => router.push('/admin/totes?status=in_transit')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Truck className="w-7 h-7 text-yellow-500 mx-auto" />
            <p className="font-black text-2xl mt-1 text-yellow-600">{stats.inTransit}</p>
            <p className="text-xs text-gray-500 mt-1">In Transit</p>
          </button>
          <button onClick={() => router.push('/admin/totes')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Package className="w-7 h-7 text-brand-navy/40 mx-auto" />
            <p className="font-black text-2xl mt-1 text-brand-navy">
              {stats.storedTotes + stats.emptyAtCustomer + stats.inTransit + stats.readyToStow}
            </p>
            <p className="text-xs text-gray-500 mt-1">Total Totes</p>
          </button>
        </div>
      </section>

      {/* Today's operations — all tappable */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Today</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => router.push('/admin/monitor')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Radio className="w-7 h-7 text-brand-blue mx-auto" />
            <p className="font-black text-2xl mt-1 text-brand-navy">
              {stats.routesActive}<span className="text-gray-400 text-lg font-semibold">/{stats.routesTotal}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Routes Active</p>
          </button>
          <button onClick={() => router.push('/admin/routes/new')}
            className="card text-center py-4 hover:shadow-md transition-shadow active:scale-[0.98]">
            <Navigation className="w-7 h-7 text-brand-navy/50 mx-auto" />
            <p className="font-black text-2xl mt-1 text-brand-navy">{stats.routesTotal}</p>
            <p className="text-xs text-gray-500 mt-1">Routes Today</p>
          </button>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="space-y-2">
          {generatedId && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-green-800">Pick List {generatedId} created</p>
                <p className="text-xs text-green-600">Warehouse can now start picking</p>
              </div>
              <button onClick={() => setGeneratedId(null)} className="text-green-400 text-lg leading-none">×</button>
            </div>
          )}
          <button
            onClick={generatePickList}
            disabled={generating}
            className="w-full flex items-center gap-4 bg-white border-2 border-brand-blue text-brand-navy rounded-2xl px-5 py-4 hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
              {generating ? <Loader2 className="w-5 h-5 text-brand-blue animate-spin" /> : <ClipboardList className="w-5 h-5 text-brand-blue" />}
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-sm">{generating ? 'Generating…' : 'Generate Pick List'}</p>
              <p className="text-xs text-gray-400">Pulls all pending-pick totes from warehouse</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300" />
          </button>
        </div>
      </section>

    </div>
  )
}
