'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ToteError } from '@/types/database'
import { CheckCircle, AlertCircle, CreditCard, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/billing'

type FilterTab = 'all' | 'seal_mismatch' | 'force_complete' | 'partial_delivery' | 'unexpected_tote' | 'failed_payment'

interface FailedPaymentCard {
  id: string
  customerId: string
  customerName: string
  amount: number
}

const ACTION_LABELS: Record<string, { primary: string; secondary: string }> = {
  seal_mismatch: { primary: 'Mark Resolved', secondary: 'Escalate' },
  force_complete: { primary: 'Mark Resolved', secondary: 'Replace Sticker' },
  partial_delivery: { primary: 'Mark Resolved', secondary: 'Investigate' },
  unexpected_tote: { primary: 'Mark Resolved', secondary: 'Investigate' },
}

const TYPE_COLORS: Record<string, string> = {
  seal_mismatch: 'bg-red-100 text-red-700',
  force_complete: 'bg-orange-100 text-orange-700',
  partial_delivery: 'bg-yellow-100 text-yellow-700',
  unexpected_tote: 'bg-purple-100 text-purple-700',
}

export default function ErrorsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [errors, setErrors] = useState<ToteError[]>([])
  const [failedPayments, setFailedPayments] = useState<FailedPaymentCard[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [errRes, custRes] = await Promise.all([
      supabase.from('errors').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, monthly_total').eq('status', 'failed_payment'),
    ])
    const errs = (errRes.data ?? []) as ToteError[]
    setErrors(errs)
    setFailedPayments((custRes.data ?? []).map(c => ({
      id: c.id, customerId: c.id, customerName: c.name, amount: c.monthly_total ?? 0,
    })))
    const initialNotes: Record<string, string> = {}
    errs.forEach(e => { initialNotes[e.id] = e.admin_notes ?? '' })
    setNotes(initialNotes)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filteredErrors = filter === 'all' || filter === 'failed_payment' ? errors : errors.filter(e => e.type === filter)
  const showErrors = filter !== 'failed_payment'
  const showFailedPayments = filter === 'all' || filter === 'failed_payment'
  const unresolved = errors.filter(e => !e.resolved).length

  async function resolve(id: string) {
    setSaving(id)
    await supabase.from('errors').update({ resolved: true, admin_notes: notes[id] ?? '' }).eq('id', id)
    setSaving(null)
    load()
  }

  async function saveNote(id: string) {
    setSaving(id)
    await supabase.from('errors').update({ admin_notes: notes[id] ?? '' }).eq('id', id)
    setSaving(null)
  }

  const FILTERS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${unresolved + failedPayments.length})` },
    { id: 'seal_mismatch', label: 'Seal Mismatch' },
    { id: 'force_complete', label: 'Force Complete' },
    { id: 'partial_delivery', label: 'Partial Delivery' },
    { id: 'unexpected_tote', label: 'Unexpected Tote' },
    { id: 'failed_payment', label: `Failed Payment (${failedPayments.length})` },
  ]

  if (loading) return <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}</div>

  const nothingToShow = (!showErrors || filteredErrors.length === 0) && (!showFailedPayments || failedPayments.length === 0)

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <h1 className="font-black text-2xl text-brand-navy">Errors</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${filter === f.id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {nothingToShow ? (
        <div className="text-center py-12">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No Errors</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {showFailedPayments && failedPayments.map(fp => (
            <div key={fp.id} className="card space-y-3 border-l-4 border-red-400">
              <div className="flex items-center gap-2 flex-wrap">
                <CreditCard className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="font-bold text-brand-navy text-sm">{fp.customerName}</span>
                <span className="status-pill text-xs bg-red-100 text-red-700">failed payment</span>
                <span className="ml-auto font-black text-red-600 text-sm">{formatCurrency(fp.amount)}</span>
              </div>
              <p className="text-xs text-gray-500">Card declined — resolve on Finance, not here.</p>
              <button
                onClick={() => router.push(`/admin/billing?tab=failed`)}
                className="w-full flex items-center justify-center gap-1.5 bg-brand-navy text-white rounded-xl py-2 text-xs font-bold hover:bg-blue-900 transition-colors"
              >
                View in Finance <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {showErrors && filteredErrors.map(err => {
            const actions = ACTION_LABELS[err.type] ?? { primary: 'Mark Resolved', secondary: 'Investigate' }
            return (
              <div key={err.id} className={`card space-y-3 ${err.resolved ? 'opacity-50' : 'border-l-4 border-red-400'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="font-bold text-brand-navy text-sm">{err.id}</span>
                  <span className={`status-pill text-xs ${TYPE_COLORS[err.type] ?? 'bg-gray-100 text-gray-500'}`}>
                    {err.type.replace(/_/g, ' ')}
                  </span>
                  {err.resolved && <span className="status-pill bg-green-100 text-green-700 text-xs ml-auto">Resolved</span>}
                </div>

                <div className="space-y-1 text-xs text-gray-600">
                  {err.stop_info && <p><span className="font-semibold">Stop:</span> {err.stop_info}</p>}
                  {err.tote_id && <p><span className="font-semibold">Tote:</span> {err.tote_id}</p>}
                  {err.error_code && <p><span className="font-semibold font-mono text-orange-700">{err.error_code}</span></p>}
                  {err.detail && <p className="text-gray-500">{err.detail}</p>}
                  {err.driver_notes && <p><span className="font-semibold">Driver notes:</span> {err.driver_notes}</p>}
                  <p className="text-gray-400">{new Date(err.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>

                {!err.resolved && (
                  <>
                    <textarea
                      value={notes[err.id] ?? ''}
                      onChange={e => setNotes(prev => ({ ...prev, [err.id]: e.target.value }))}
                      placeholder="Add admin notes..."
                      rows={2}
                      className="input-field resize-none text-sm"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => resolve(err.id)} disabled={saving === err.id}
                        className="flex-1 bg-brand-navy text-white rounded-xl py-2 text-xs font-bold hover:bg-blue-900 transition-colors disabled:opacity-50">
                        {saving === err.id ? 'Saving...' : actions.primary}
                      </button>
                      <button onClick={() => saveNote(err.id)} disabled={saving === err.id}
                        className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-2 text-xs font-bold hover:bg-gray-50 transition-colors">
                        {actions.secondary}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
