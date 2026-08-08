'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DashboardThresholds } from '@/types/database'
import { ChevronLeft, Save, RotateCcw, CheckCircle2 } from 'lucide-react'

// Mirrors the column defaults in supabase/schema.sql Section 4.7 — kept in
// sync manually since there's no single source of truth for "defaults"
// beyond the schema itself.
const DEFAULTS: Omit<DashboardThresholds, 'id' | 'region_id' | 'updated_at'> = {
  unstowed_warn: 5, unstowed_critical: 15,
  routes_today_warn: 1, routes_today_critical: 3,
  empty_totes_pace_amber_pts: 10, empty_totes_pace_red_pts: 25,
  full_totes_pace_amber_pts: 10, full_totes_pace_red_pts: 25,
  picks_completed_pace_amber_pts: 10, picks_completed_pace_red_pts: 25,
  empty_bins_warn: 10, empty_bins_critical: 4,
  open_pick_totes_warn: 48, open_pick_totes_critical: 78,
}

type EditableFields = keyof typeof DEFAULTS

interface Row {
  label: string
  desc: string
  fields: { key: EditableFields; label: string; suffix: string }[]
}

const ROWS: Row[] = [
  {
    label: 'Unstowed — Need Bin', desc: 'Totes on the floor, awaiting a bin.',
    fields: [
      { key: 'unstowed_warn', label: 'Warn at', suffix: 'totes' },
      { key: 'unstowed_critical', label: 'Critical at', suffix: 'totes' },
    ],
  },
  {
    label: 'Routes Today', desc: 'Routes not yet created for totes staged and ready to go out.',
    fields: [
      { key: 'routes_today_warn', label: 'Warn at', suffix: 'routes' },
      { key: 'routes_today_critical', label: 'Critical at', suffix: 'routes' },
    ],
  },
  {
    label: 'Empty Totes Delivered — Pace', desc: '% of shift elapsed vs. % of planned deliveries done.',
    fields: [
      { key: 'empty_totes_pace_amber_pts', label: 'Amber if behind by', suffix: 'pts' },
      { key: 'empty_totes_pace_red_pts', label: 'Red if behind by', suffix: 'pts' },
    ],
  },
  {
    label: 'Full Totes Picked Up — Pace', desc: '% of shift elapsed vs. % of planned pickups done.',
    fields: [
      { key: 'full_totes_pace_amber_pts', label: 'Amber if behind by', suffix: 'pts' },
      { key: 'full_totes_pace_red_pts', label: 'Red if behind by', suffix: 'pts' },
    ],
  },
  {
    label: 'Picks Completed — Pace', desc: '% of today\'s planned picks (totes, not pick lists) done.',
    fields: [
      { key: 'picks_completed_pace_amber_pts', label: 'Amber if behind by', suffix: 'pts' },
      { key: 'picks_completed_pace_red_pts', label: 'Red if behind by', suffix: 'pts' },
    ],
  },
  {
    label: 'Empty Bins', desc: 'Completely unused locations (0 of X stacked) across the whole warehouse. Low is bad.',
    fields: [
      { key: 'empty_bins_warn', label: 'Warn at', suffix: 'empty' },
      { key: 'empty_bins_critical', label: 'Critical at', suffix: 'empty' },
    ],
  },
  {
    label: 'Open Pick Lists — Totes to Move', desc: 'Total totes across all open pick lists, not the list count.',
    fields: [
      { key: 'open_pick_totes_warn', label: 'Warn at', suffix: 'totes' },
      { key: 'open_pick_totes_critical', label: 'Critical at', suffix: 'totes' },
    ],
  },
]

export default function ThresholdsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [values, setValues] = useState<Record<EditableFields, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('dashboard_thresholds').select('*').eq('id', 1).maybeSingle()
    if (data) {
      const v = { ...DEFAULTS }
      for (const k of Object.keys(DEFAULTS) as EditableFields[]) v[k] = (data as unknown as Record<string, number>)[k]
      setValues(v)
    } else {
      setValues({ ...DEFAULTS })
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function setField(key: EditableFields, val: string) {
    const n = parseInt(val, 10)
    setValues(prev => prev ? { ...prev, [key]: Number.isFinite(n) ? n : 0 } : prev)
    setSaved(false)
  }

  async function save(next?: Record<EditableFields, number>) {
    const toSave = next ?? values
    if (!toSave) return
    setSaving(true)
    const { error } = await supabase.from('dashboard_thresholds').update(toSave).eq('id', 1)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  function resetToDefaults() {
    setValues({ ...DEFAULTS })
    save({ ...DEFAULTS })
  }

  if (loading || !values) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <button onClick={() => router.push('/admin/settings')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Settings
      </button>

      <div>
        <h1 className="font-black text-2xl text-brand-navy">Dashboard Alert Thresholds</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set the warning and critical cutoffs each KPI tile uses to decide its color. Changes apply to every
          operations dashboard immediately — no per-user settings.
        </p>
      </div>

      <div className="space-y-3">
        {ROWS.map(row => (
          <div key={row.label} className="card space-y-3">
            <div>
              <p className="font-bold text-brand-navy text-sm">{row.label}</p>
              <p className="text-xs text-gray-400">{row.desc}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {row.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={0} value={values[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    <span className="text-xs text-gray-400">{f.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => save()}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-navy text-white rounded-xl px-5 py-3 text-sm font-bold hover:bg-blue-900 transition-colors disabled:opacity-60"
        >
          {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
        </button>
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-2 border-2 border-gray-200 text-gray-600 rounded-xl px-5 py-3 text-sm font-bold hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Reset to Defaults
        </button>
      </div>
    </div>
  )
}
