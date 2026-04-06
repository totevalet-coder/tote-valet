'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ToteError } from '@/types/database'
import { CheckCircle, AlertCircle } from 'lucide-react'

type FilterTab = 'all' | 'seal_mismatch' | 'force_complete' | 'partial_delivery'

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
  const supabase = createClient()
  const [errors, setErrors] = useState<ToteError[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('errors').select('*').order('created_at', { ascending: false })
    const errs = (data ?? []) as ToteError[]
    setErrors(errs)
    const initialNotes: Record<string, string> = {}
    errs.forEach(e => { initialNotes[e.id] = e.admin_notes ?? '' })
    setNotes(initialNotes)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? errors : errors.filter(e => e.type === filter)
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
    { id: 'all', label: `All (${unresolved})` },
    { id: 'seal_mismatch', label: 'Seal Mismatch' },
    { id: 'force_complete', label: 'Force Complete' },
    { id: 'partial_delivery', label: 'Partial Delivery' },
  ]

  if (loading) return <div className="px-5 pt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}</div>

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Errors & Flags</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${filter === f.id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-lg">No Errors</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(err => {
            const actions = ACTION_LABELS[err.type] ?? { primary: 'Mark Resolved', secondary: 'Investigate' }
            return (
              <div key={err.id} className={`card space-y-3 ${err.resolved ? 'opacity-50' : 'border-l-4 border-red-400'}`}>
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="font-bold text-brand-navy text-sm">{err.id}</span>
                  <span className={`status-pill text-xs ${TYPE_COLORS[err.type] ?? 'bg-gray-100 text-gray-500'}`}>
                    {err.type.replace(/_/g, ' ')}
                  </span>
                  {err.resolved && <span className="status-pill bg-green-100 text-green-700 text-xs ml-auto">Resolved</span>}
                </div>

                {/* Details */}
                <div className="space-y-1 text-xs text-gray-600">
                  {err.stop_info && <p><span className="font-semibold">Stop:</span> {err.stop_info}</p>}
                  {err.tote_id && <p><span className="font-semibold">Tote:</span> {err.tote_id}</p>}
                  {err.error_code && <p><span className="font-semibold font-mono text-orange-700">{err.error_code}</span></p>}
                  {err.detail && <p className="text-gray-500">{err.detail}</p>}
                  {err.driver_notes && <p><span className="font-semibold">Driver notes:</span> {err.driver_notes}</p>}
                  <p className="text-gray-400">{new Date(err.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>

                {/* Admin notes */}
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
