'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Download, Clock, CreditCard, Gift } from 'lucide-react'
import type { Tote } from '@/types/database'

interface BillingLine {
  toteName: string
  status: string
  charge: number
  chargeType: 'monthly' | 'weekly'
}

const FREE_EXCHANGES_ALLOWED = 2

export default function BillingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [totes, setTotes] = useState<Tote[]>([])
  const [freeExchangesUsed, setFreeExchangesUsed] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) { router.push('/login'); return }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, free_exchanges_used')
        .eq('auth_id', userData.user.id)
        .single()

      if (!customer) { setLoading(false); return }

      setFreeExchangesUsed(customer.free_exchanges_used ?? 0)

      const { data: totesData } = await supabase
        .from('totes')
        .select('*')
        .eq('customer_id', customer.id)

      setTotes((totesData as Tote[]) ?? [])
      setLoading(false)
    }
    load()
  }, [supabase, router])

  const billingLines: BillingLine[] = totes.map(t => {
    if (t.status === 'empty_at_customer') {
      return {
        toteName: t.tote_name ?? t.id,
        status: 'Empty at Home',
        charge: 1.0,
        chargeType: 'weekly',
      }
    }
    return {
      toteName: t.tote_name ?? t.id,
      status: t.status === 'stored' ? 'In Warehouse' : t.status.replace(/_/g, ' '),
      charge: 15.0,
      chargeType: 'monthly',
    }
  })

  const monthlyTotal = billingLines
    .filter(l => l.chargeType === 'monthly')
    .reduce((sum, l) => sum + l.charge, 0)

  const weeklyTotal = billingLines
    .filter(l => l.chargeType === 'weekly')
    .reduce((sum, l) => sum + l.charge, 0)

  const estimatedMonthly = monthlyTotal + weeklyTotal * 4

  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-brand-navy font-semibold text-sm"
      >
        <ChevronLeft className="w-5 h-5" />
        Back
      </button>

      <div>
        <h1 className="text-2xl font-black text-brand-navy">Billing & Invoice</h1>
        <p className="text-gray-400 text-sm mt-1">{currentMonth}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="bg-brand-navy rounded-2xl p-5 text-white">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-1">
              Estimated This Month
            </p>
            <p className="text-4xl font-black">${estimatedMonthly.toFixed(2)}</p>
            <p className="text-white/50 text-xs mt-1">Auto-charged on the 1st of each month</p>
          </div>

          {/* Auto-charge notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-700 text-sm">
              Your card on file will be auto-charged on the 1st of each month. Billing activates on your first pickup.
            </p>
          </div>

          {/* Line items */}
          <div className="card divide-y divide-gray-50">
            <div className="pb-3">
              <p className="text-sm font-bold text-brand-navy">Monthly Invoice Breakdown</p>
            </div>

            {billingLines.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm">No totes yet</div>
            ) : (
              billingLines.map((line, i) => (
                <div key={i} className="py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{line.toteName}</p>
                    <p className="text-xs text-gray-400">{line.status}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold text-brand-navy">
                      ${line.charge.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {line.chargeType === 'monthly' ? '/mo' : '/wk'}
                    </p>
                  </div>
                </div>
              ))
            )}

            {/* Totals */}
            <div className="pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Storage totes ({billingLines.filter(l => l.chargeType === 'monthly').length} × $15/mo)</span>
                <span className="font-semibold">${monthlyTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Empty at home ({billingLines.filter(l => l.chargeType === 'weekly').length} × $1/wk)</span>
                <span className="font-semibold">${weeklyTotal.toFixed(2)}/wk</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-brand-navy border-t border-gray-100 pt-2 mt-2">
                <span>Estimated Monthly Total</span>
                <span>${estimatedMonthly.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Free exchanges tracker */}
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Gift className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-brand-navy">Free Tote Exchanges</p>
                <p className="text-xs text-gray-400">
                  {Math.max(0, FREE_EXCHANGES_ALLOWED - freeExchangesUsed)} of {FREE_EXCHANGES_ALLOWED} remaining this month
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: FREE_EXCHANGES_ALLOWED }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded-full ${
                    i < freeExchangesUsed ? 'bg-gray-200' : 'bg-green-400'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button className="w-full flex items-center justify-center gap-2 btn-primary">
              <Download className="w-4 h-4" />
              Download Invoice PDF
            </button>
            <button className="w-full flex items-center justify-center gap-2 btn-outline">
              <Clock className="w-4 h-4" />
              View Past Invoices
            </button>
          </div>
        </>
      )}
    </div>
  )
}
