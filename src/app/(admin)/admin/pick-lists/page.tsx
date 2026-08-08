'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PickList, PickListBin } from '@/types/database'
import { ClipboardList, Plus, Loader2, CheckCircle2, Info } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import { generatePickList } from '@/lib/pickLists'

interface EnrichedPickList extends PickList {
  assignedName: string | null
}

const STATUS_STYLES: Record<string, string> = {
  ready:       'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  complete:    'bg-green-100 text-green-700',
}

function countTotes(pl: PickList) {
  return (pl.bins as PickListBin[]).reduce((sum, b) => sum + b.totes.length, 0)
}
function countPicked(pl: PickList) {
  return (pl.bins as PickListBin[]).reduce((sum, b) => sum + b.totes.filter(t => t.status === 'picked').length, 0)
}
function binRange(pl: PickList) {
  const bins = (pl.bins as PickListBin[]).map(b => b.bin_id).sort()
  if (bins.length === 0) return '—'
  return bins.length === 1 ? bins[0] : `${bins[0]}–${bins[bins.length - 1]}`
}

export default function AdminPickListsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [lists, setLists] = useState<EnrichedPickList[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('pick_lists').select('*').order('generated_at', { ascending: false })
    const rows = (data ?? []) as PickList[]

    const assignedIds = [...new Set(rows.map(r => r.assigned_to).filter((v): v is string => !!v))]
    const nameMap: Record<string, string> = {}
    if (assignedIds.length > 0) {
      const { data: staff } = await supabase.from('customers').select('id, name').in('id', assignedIds)
      ;(staff ?? []).forEach(s => { nameMap[s.id] = s.name })
    }

    setLists(rows.map(r => ({ ...r, assignedName: r.assigned_to ? (nameMap[r.assigned_to] ?? 'Unknown') : null })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    setGenerating(true)
    setGeneratedId(null)
    const result = await generatePickList(supabase)
    if (result.ok) { setGeneratedId(result.id); load() }
    else alert(result.error)
    setGenerating(false)
  }

  const active = lists.filter(l => l.status !== 'complete')
  const inProgressLists = lists.filter(l => l.status === 'in_progress')
  const totesPlanned = active.reduce((s, l) => s + countTotes(l), 0)
  const totesInProcess = inProgressLists.reduce((s, l) => s + countTotes(l), 0)
  const totesPicked = active.reduce((s, l) => s + countPicked(l), 0)

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Pick</h1>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-blue-900 transition-colors disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {generating ? 'Generating…' : 'Generate Pick List'}
        </button>
      </div>

      {generatedId && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 max-w-md">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-bold text-green-800">Pick List {generatedId} created</p>
          <button onClick={() => setGeneratedId(null)} className="ml-auto text-green-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Picks Planned" value={totesPlanned} subtext={`Across ${active.length} pick list${active.length !== 1 ? 's' : ''}`} icon={ClipboardList} />
        <StatCard label="Picks In Process" value={totesInProcess} subtext="Being pulled right now" icon={ClipboardList} valueColor="text-yellow-600" />
        <StatCard label="Picks Completed" value={totesPicked} total={totesPlanned || undefined} subtext="vs. totes planned today" icon={CheckCircle2} valueColor="text-green-600" />
      </div>

      {/* Walk-time optimization toggle — UI only, no algorithm behind it yet */}
      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed w-fit" title="Walk-time optimization is disabled until layout is mapped in Warehouse Setup">
        <input type="checkbox" disabled className="rounded" />
        Optimize for walk time
        <Info className="w-3.5 h-3.5" />
      </label>

      {/* Table */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Pick Lists — Today</h2>
        {lists.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-bold text-gray-400 text-lg">No Pick Lists Yet</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Pick List</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Totes</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Bin Range</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Assigned To</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map(pl => {
                    const total = countTotes(pl)
                    const picked = countPicked(pl)
                    return (
                      <tr key={pl.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-brand-navy">{pl.id}</td>
                        <td className="px-4 py-3 text-gray-600">{picked}/{total}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{binRange(pl)}</td>
                        <td className="px-4 py-3 text-gray-600">{pl.assignedName ?? <span className="text-gray-300">Unassigned</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`status-pill text-[10px] ${STATUS_STYLES[pl.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {pl.status.replace('_', ' ')}
                          </span>
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

      <button onClick={() => router.push('/warehouse/pick-lists')} className="text-xs text-gray-400 hover:text-gray-600">
        Warehouse's working view (scan-to-pick) lives at /warehouse/pick-lists →
      </button>
    </div>
  )
}
