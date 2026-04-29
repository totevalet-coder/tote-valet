'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Download, Clock, CreditCard, Gift, CheckCircle2, Plus } from 'lucide-react'
import type { Tote } from '@/types/database'
import CardSetupForm from '@/components/ui/CardSetupForm'
import type { CardSetupResult } from '@/components/ui/CardSetupForm'
import { FREE_EXCHANGES_PER_YEAR, GRACE_PERIOD_DAYS } from '@/lib/billing'

interface CardInfo {
  last4: string
  brand: string
  exp_month: number
  exp_year: number
}

interface BillingLine {
  toteName: string
  status: string
  charge: number
  chargeType: 'monthly' | 'weekly'
}

const FREE_EXCHANGES_ALLOWED = FREE_EXCHANGES_PER_YEAR

export default function BillingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [totes, setTotes] = useState<Tote[]>([])
  const [freeExchangesUsed, setFreeExchangesUsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null)
  const [showCardSetup, setShowCardSetup] = useState(false)
  const [cardSaved, setCardSaved] = useState(false)
  const [startingTotes, setStartingTotes] = useState<number | null>(null)
  const [firstPickupDate, setFirstPickupDate] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) { router.push('/login'); return }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, free_exchanges_used, notes, name, address')
        .eq('auth_id', userData.user.id)
        .single()

      if (!customer) { setLoading(false); return }

      setCustomerId(customer.id)
      setCustomerName(customer.name ?? '')
      setCustomerAddress(customer.address ?? '')
      setFreeExchangesUsed(customer.free_exchanges_used ?? 0)

      // Parse starting totes + first pickup from signup notes
      if (customer.notes) {
        const totesMatch = customer.notes.match(/Starting totes: (\d+)/)
        const dateMatch = customer.notes.match(/First pickup: ([\d-]+)/)
        if (totesMatch) setStartingTotes(parseInt(totesMatch[1]))
        if (dateMatch) setFirstPickupDate(dateMatch[1])
      }

      // Fetch card info from Stripe
      fetch(`/api/stripe/card-info?customerId=${customer.id}`)
        .then(r => r.json())
        .then(d => { if (d.card) setCardInfo(d.card) })

      const { data: totesData } = await supabase
        .from('totes')
        .select('*')
        .eq('customer_id', customer.id)

      setTotes((totesData as Tote[]) ?? [])
      setLoading(false)
    }
    load()
  }, [supabase, router])

  // Grace period: if tote is empty_at_customer, pickup_requested, and updated within GRACE_PERIOD_DAYS
  function isGrace(tote: Tote): boolean {
    if (tote.status !== 'empty_at_customer') return false
    if (!(tote as unknown as { pickup_requested?: boolean }).pickup_requested) return false
    const updatedAt = (tote as unknown as { updated_at?: string }).updated_at
    if (!updatedAt) return false
    const days = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days <= GRACE_PERIOD_DAYS
  }

  const billingLines: BillingLine[] = totes.map(t => {
    if (t.status === 'empty_at_customer') {
      const grace = isGrace(t)
      return {
        toteName: t.tote_name ?? t.id,
        status: grace ? `Empty at Home · Grace period (${GRACE_PERIOD_DAYS}-day pickup window)` : 'Empty at Home',
        charge: grace ? 0 : 1.0,
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

  async function downloadInvoicePDF() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })

    const navy = [30, 58, 95] as const
    const blue = [37, 99, 235] as const
    const gray = [107, 114, 128] as const
    const lightGray = [243, 244, 246] as const
    const now = new Date()
    const invoiceNum = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`

    // ── Header bar ──────────────────────────────────────────
    doc.setFillColor(...navy)
    doc.rect(0, 0, 612, 80, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTE VALET', 40, 35)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 200, 230)
    doc.text('6582 Gun Club Rd, Coopersburg, PA 18036', 40, 52)
    doc.text('hello@totevalet.com', 40, 64)

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', 572, 35, { align: 'right' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 200, 230)
    doc.text(invoiceNum, 572, 52, { align: 'right' })
    doc.text(now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 572, 64, { align: 'right' })

    // ── Bill To ──────────────────────────────────────────────
    doc.setTextColor(...gray)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('BILL TO', 40, 110)

    doc.setTextColor(...navy)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(customerName || 'Customer', 40, 126)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    if (customerAddress) doc.text(customerAddress, 40, 140)

    // ── Billing period ───────────────────────────────────────
    doc.setTextColor(...gray)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('BILLING PERIOD', 380, 110)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...navy)
    doc.text(currentMonth, 380, 126)

    // ── Line items table ─────────────────────────────────────
    let y = 185

    // Table header
    doc.setFillColor(...lightGray)
    doc.rect(40, y, 532, 24, 'F')
    doc.setTextColor(...navy)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTE', 52, y + 15)
    doc.text('STATUS', 200, y + 15)
    doc.text('RATE', 380, y + 15)
    doc.text('AMOUNT', 572, y + 15, { align: 'right' })

    y += 24

    // Rows
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    const rows = billingLines.length > 0 ? billingLines : (startingTotes ? Array.from({ length: startingTotes }, (_, i) => ({
      toteName: `Tote ${i + 1}`,
      status: 'Pending first delivery',
      charge: 1.0,
      chargeType: 'weekly' as const,
    })) : [])

    rows.forEach((line, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 251, 252)
        doc.rect(40, y, 532, 22, 'F')
      }
      doc.setTextColor(...navy)
      doc.text(line.toteName, 52, y + 14)
      doc.setTextColor(...gray)
      doc.text(line.status, 200, y + 14)
      doc.text(line.chargeType === 'monthly' ? '$15.00/mo' : '$1.00/wk', 380, y + 14)
      doc.setTextColor(...navy)
      doc.text(`$${line.charge.toFixed(2)}`, 572, y + 14, { align: 'right' })
      y += 22
    })

    // Divider
    y += 8
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(1)
    doc.line(40, y, 572, y)
    y += 16

    // Totals
    const totals = [
      { label: 'Stored in warehouse', value: `$${monthlyTotal.toFixed(2)}/mo` },
      { label: 'At home (weekly)', value: `$${weeklyTotal.toFixed(2)}/wk` },
      { label: 'Estimated monthly total', value: `$${estimatedMonthly.toFixed(2)}`, bold: true },
    ]

    totals.forEach(({ label, value, bold }) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(bold ? 11 : 10)
      doc.setTextColor(bold ? navy[0] : gray[0], bold ? navy[1] : gray[1], bold ? navy[2] : gray[2])
      doc.text(label, 380, y)
      doc.setTextColor(...navy)
      doc.text(value, 572, y, { align: 'right' })
      y += bold ? 0 : 20
    })

    // ── Footer ───────────────────────────────────────────────
    doc.setFillColor(...navy)
    doc.rect(0, 730, 612, 42, 'F')
    doc.setTextColor(180, 200, 230)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Thank you for choosing Tote Valet  ·  hello@totevalet.com  ·  (610) 555-0100', 306, 754, { align: 'center' })

    doc.save(`ToteValet-Invoice-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}.pdf`)
  }

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
            {totes.length === 0 && startingTotes ? (
              <>
                <p className="text-4xl font-black">${(startingTotes * 1).toFixed(2)}<span className="text-lg font-semibold text-white/60">/wk</span></p>
                <p className="text-white/50 text-xs mt-1">{startingTotes} tote{startingTotes !== 1 ? 's' : ''} × $1/wk while at home · $15/mo once stored</p>
              </>
            ) : (
              <>
                <p className="text-4xl font-black">${estimatedMonthly.toFixed(2)}</p>
                <p className="text-white/50 text-xs mt-1">Auto-charged on the 1st of each month</p>
              </>
            )}
          </div>

          {/* Pending first delivery banner */}
          {totes.length === 0 && firstPickupDate && (
            <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-brand-navy font-semibold text-sm">First delivery scheduled</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {new Date(firstPickupDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Billing activates after pickup
                </p>
              </div>
            </div>
          )}

          {/* Auto-charge notice (only once totes are active) */}
          {totes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-700 text-sm">
                Your card on file will be auto-charged on the 1st of each month.
              </p>
            </div>
          )}

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
                <span className="text-gray-500">Stored in warehouse ({billingLines.filter(l => l.chargeType === 'monthly').length} × $15/mo)</span>
                <span className="font-semibold">${monthlyTotal.toFixed(2)}/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">At home ({billingLines.filter(l => l.chargeType === 'weekly').length} × $1/wk)</span>
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
                  {Math.max(0, FREE_EXCHANGES_ALLOWED - freeExchangesUsed)} of {FREE_EXCHANGES_ALLOWED} remaining this year
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

          {/* Payment Method */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-brand-navy text-sm">Payment Method</p>
              {cardInfo && (
                <button onClick={() => { setShowCardSetup(true); setCardSaved(false) }}
                  className="text-xs text-brand-blue font-semibold hover:underline">
                  Update
                </button>
              )}
            </div>

            {cardSaved && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-700">Card updated successfully</p>
              </div>
            )}

            {showCardSetup && customerId ? (
              <CardSetupForm
                customerId={customerId}
                submitLabel="Save Card"
                onSuccess={async (result: CardSetupResult) => {
                  await fetch('/api/stripe/save-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customerId, paymentMethodId: result.paymentMethodId, stripeCustomerId: result.stripeCustomerId }),
                  })
                  const d = await fetch(`/api/stripe/card-info?customerId=${customerId}`).then(r => r.json())
                  if (d.card) setCardInfo(d.card)
                  setShowCardSetup(false)
                  setCardSaved(true)
                }}
                onCancel={() => setShowCardSetup(false)}
              />
            ) : cardInfo ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <p className="text-sm font-bold text-brand-navy capitalize">
                    {cardInfo.brand} •••• {cardInfo.last4}
                  </p>
                  <p className="text-xs text-gray-400">
                    Expires {cardInfo.exp_month}/{cardInfo.exp_year}
                  </p>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCardSetup(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm font-semibold text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors">
                <Plus className="w-4 h-4" />
                Add Payment Method
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={downloadInvoicePDF} className="w-full flex items-center justify-center gap-2 btn-primary">
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
