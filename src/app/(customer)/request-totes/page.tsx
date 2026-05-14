'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Package, CheckCircle2, Loader2, Clock } from 'lucide-react'

const QUICK_AMOUNTS = [1, 2, 3, 4]

interface PendingDelivery {
  id: string
  quantity: number
  preferred_date: string
}

export default function RequestTotesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [quantity, setQuantity] = useState<number | null>(null)
  const [customQty, setCustomQty] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([])

  useEffect(() => {
    async function loadPending() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const { data: customer } = await supabase
        .from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) return
      const { data } = await supabase
        .from('tote_requests')
        .select('id, quantity, preferred_date')
        .eq('customer_id', customer.id)
        .eq('type', 'empty_tote_delivery')
        .eq('status', 'pending')
        .order('preferred_date', { ascending: true })
      setPendingDeliveries(data ?? [])
    }
    loadPending()
  }, [supabase])

  const selectedQty = quantity ?? (customQty ? parseInt(customQty) : null)

  async function handleSubmit() {
    if (!selectedQty || selectedQty < 1) { setError('Please select or enter a quantity.'); return }
    if (!preferredDate) { setError('Please choose a preferred delivery date.'); return }

    setSaving(true)
    setError(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')

      const { data: customer } = await supabase
        .from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      const { error: e } = await supabase.from('tote_requests').insert({
        customer_id: customer.id,
        type: 'empty_tote_delivery',
        quantity: selectedQty,
        preferred_date: preferredDate,
        status: 'pending',
      })
      if (e) throw e

      // Refresh pending list then show success
      const { data: refreshed } = await supabase
        .from('tote_requests')
        .select('id, quantity, preferred_date')
        .eq('customer_id', customer.id)
        .eq('type', 'empty_tote_delivery')
        .eq('status', 'pending')
        .order('preferred_date', { ascending: true })
      setPendingDeliveries(refreshed ?? [])

      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit request.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="px-5 pt-6 pb-6 text-center py-16">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-brand-navy mb-2">Request Submitted!</h2>
        <p className="text-gray-500 text-sm mb-1">
          {selectedQty} empty tote{selectedQty !== 1 ? 's' : ''} requested.
        </p>
        <p className="text-gray-400 text-xs mb-8">
          Preferred delivery:{' '}
          {new Date(preferredDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          })}
        </p>
        <div className="space-y-3">
          <button onClick={() => { setDone(false); setQuantity(null); setCustomQty(''); setPreferredDate('') }} className="btn-secondary w-full">
            Request More Totes
          </button>
          <button onClick={() => router.push('/dashboard')} className="btn-outline w-full">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <div>
        <h1 className="text-2xl font-black text-brand-navy">Request Empty Totes</h1>
        <p className="text-gray-500 text-sm mt-1">We&apos;ll deliver empty totes to your door at no charge.</p>
      </div>

      {/* Pending deliveries */}
      {pendingDeliveries.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-800">Pending Deliveries</p>
          </div>
          {pendingDeliveries.map(d => {
            const dateStr = new Date(d.preferred_date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })
            return (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-amber-900 font-medium">
                  {d.quantity} empty tote{d.quantity !== 1 ? 's' : ''}
                </span>
                <span className="text-amber-700">arriving {dateStr}</span>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Quantity selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">How many totes do you need?</label>
        <div className="grid grid-cols-4 gap-3 mb-3">
          {QUICK_AMOUNTS.map(n => (
            <button
              key={n}
              onClick={() => { setQuantity(n); setCustomQty('') }}
              className={`py-4 rounded-2xl text-xl font-black border-2 transition-all active:scale-95 ${
                quantity === n && !customQty
                  ? 'bg-brand-navy text-white border-brand-navy shadow-lg'
                  : 'bg-white text-brand-navy border-gray-200 hover:border-brand-blue'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Custom number input */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or enter a number</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <input
          type="number"
          min="1"
          max="50"
          value={customQty}
          onChange={e => { setCustomQty(e.target.value); setQuantity(null) }}
          placeholder="e.g. 6"
          className="input-field mt-3"
        />
      </div>

      {/* Summary pill */}
      {selectedQty && selectedQty > 0 && (
        <div className="flex items-center gap-3 bg-brand-blue/5 border border-brand-blue/20 rounded-2xl px-4 py-3">
          <Package className="w-5 h-5 text-brand-blue flex-shrink-0" />
          <p className="text-sm font-semibold text-brand-navy">
            {selectedQty} empty tote{selectedQty !== 1 ? 's' : ''} will be delivered
          </p>
        </div>
      )}

      {/* Preferred delivery date */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preferred Delivery Date</label>
        <input
          type="date"
          value={preferredDate}
          onChange={e => setPreferredDate(e.target.value)}
          min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
          className="input-field"
        />
        <p className="text-xs text-gray-400 mt-1">We&apos;ll confirm the exact date once scheduled.</p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || !selectedQty || !preferredDate}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Request {selectedQty ? `${selectedQty} Tote${selectedQty !== 1 ? 's' : ''}` : 'Totes'}
      </button>
    </div>
  )
}
