'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import StatBox from '@/components/ui/StatBox'
import { PlusCircle, PackageSearch, Package, Truck } from 'lucide-react'
import type { Tote } from '@/types/database'

interface ToteStats {
  storedInWarehouse: number
  inTransit: number
  fullAtHome: number
  emptyAtHome: number
}

interface PendingDelivery {
  id: string
  quantity: number
  preferred_date: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<ToteStats>({
    storedInWarehouse: 0,
    inTransit: 0,
    fullAtHome: 0,
    emptyAtHome: 0,
  })
  const [loading, setLoading] = useState(true)
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([])

  const loadStats = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/login')
      return
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_id', userData.user.id)
      .single()

    if (!customer) {
      setLoading(false)
      return
    }

    const [totesRes, deliveriesRes] = await Promise.all([
      supabase.from('totes').select('status, items').eq('customer_id', customer.id),
      supabase
        .from('tote_requests')
        .select('id, quantity, preferred_date')
        .eq('customer_id', customer.id)
        .eq('type', 'empty_tote_delivery')
        .eq('status', 'pending')
        .order('preferred_date', { ascending: true }),
    ])

    setPendingDeliveries(deliveriesRes.data ?? [])

    const totes = totesRes.data
    if (totes) {
      const storedInWarehouse = totes.filter(
        t => t.status === 'stored' || t.status === 'ready_to_stow' || t.status === 'pending_pick' || t.status === 'picked'
      ).length

      const inTransit = totes.filter(t => t.status === 'in_transit').length

      const atHome = totes.filter(t => t.status === 'empty_at_customer')
      const emptyAtHome = atHome.filter(t => !t.items || (t.items as []).length === 0).length
      const fullAtHome = atHome.filter(t => t.items && (t.items as []).length > 0).length

      setStats({ storedInWarehouse, inTransit, fullAtHome, emptyAtHome })
    }

    setLoading(false)
  }, [supabase, router])

  // Load on mount
  useEffect(() => { loadStats() }, [loadStats])

  // Refresh when tab becomes visible again (returning from Add Items etc.)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadStats()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadStats])

  return (
    <div className="px-5 pt-6 pb-6 space-y-6">
      {/* Stats row */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Your Totes
        </h2>
        {loading ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              {[1, 2].map(i => (
                <div key={i} className="flex-1 h-24 bg-gray-200 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="flex gap-3">
              {[3, 4].map(i => (
                <div key={i} className="flex-1 h-24 bg-gray-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <StatBox
                label="Stored in Warehouse"
                value={stats.storedInWarehouse}
                emoji="🏢"
                colorClass="text-brand-blue"
                onClick={() => router.push('/my-items?filter=stored')}
              />
              <StatBox
                label="In Transit"
                value={stats.inTransit}
                emoji="🚐"
                colorClass="text-yellow-600"
                onClick={() => router.push('/my-items?filter=in_transit')}
              />
            </div>
            <div className="flex gap-3">
              <StatBox
                label="Full Totes at Home"
                value={stats.fullAtHome}
                emoji="📦"
                colorClass="text-brand-navy"
                onClick={() => router.push('/my-items?filter=empty_at_customer')}
              />
              <StatBox
                label="Empty Totes at Home"
                value={stats.emptyAtHome}
                emoji="🗃️"
                colorClass="text-gray-500"
                onClick={() => router.push('/my-items?filter=empty_at_customer')}
              />
            </div>
          </div>
        )}
      </section>

      {/* Pending empty tote deliveries */}
      {pendingDeliveries.length > 0 && (() => {
        const soonest = pendingDeliveries[0]
        const dateStr = new Date(soonest.preferred_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const extras = pendingDeliveries.length - 1
        return (
          <button
            onClick={() => router.push('/request-totes')}
            className="w-full flex items-center gap-3 bg-brand-blue/5 border border-brand-blue/30 rounded-2xl px-4 py-3 text-left hover:bg-brand-blue/10 transition-colors"
          >
            <Truck className="w-5 h-5 text-brand-blue flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-navy">
                {soonest.quantity} empty tote{soonest.quantity !== 1 ? 's' : ''} arriving {dateStr}
              </p>
              {extras > 0 && (
                <p className="text-xs text-brand-blue mt-0.5">+{extras} more deliver{extras === 1 ? 'y' : 'ies'} pending</p>
              )}
            </div>
          </button>
        )
      })()}

      {/* Primary action buttons */}
      <section className="space-y-3">
        <button
          onClick={() => router.push('/add-items')}
          className="w-full flex items-center gap-4 bg-brand-navy text-white rounded-2xl px-6 py-5 shadow-lg hover:bg-blue-900 active:scale-[0.98] transition-all duration-150"
        >
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <PlusCircle className="w-7 h-7" />
          </div>
          <div className="text-left">
            <p className="font-black text-base">+ Add Items to Tote</p>
            <p className="text-white/60 text-xs mt-0.5">Scan, photo, or manual entry</p>
          </div>
        </button>

        <button
          onClick={() => router.push('/my-items')}
          className="w-full flex items-center gap-4 bg-white border-2 border-brand-blue text-brand-navy rounded-2xl px-6 py-5 shadow-sm hover:bg-blue-50 active:scale-[0.98] transition-all duration-150"
        >
          <div className="w-12 h-12 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <PackageSearch className="w-7 h-7 text-brand-blue" />
          </div>
          <div className="text-left">
            <p className="font-black text-base">My Items / Pickups & Returns</p>
            <p className="text-gray-400 text-xs mt-0.5">Browse, request pickup or delivery</p>
          </div>
        </button>

        <button
          onClick={() => router.push('/request-totes')}
          className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 text-brand-navy rounded-2xl px-6 py-5 shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all duration-150"
        >
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Package className="w-7 h-7 text-gray-500" />
          </div>
          <div className="text-left">
            <p className="font-black text-base">Request Empty Totes</p>
            <p className="text-gray-400 text-xs mt-0.5">Need more totes delivered to your home</p>
          </div>
        </button>
      </section>

      {/* Quick tips */}
      <section className="bg-brand-blue/5 border border-brand-blue/20 rounded-2xl p-5">
        <p className="text-brand-navy font-bold text-sm mb-2">How it works</p>
        <div className="space-y-2">
          {[
            ['🚐', 'We pick up your packed totes'],
            ['🏢', 'We store them safely in our warehouse'],
            ['📲', 'Request items back anytime in the app'],
            ['🚚', 'We deliver your totes to your door'],
          ].map(([emoji, text]) => (
            <div key={text} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="text-base">{emoji}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
