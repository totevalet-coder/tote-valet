import type { SupabaseClient } from '@supabase/supabase-js'

export type GeneratePickListResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Pulls every `pending_pick` tote, groups it by bin (walk-order, not route-
 * aware — this is the existing "location-based" pick mode), and inserts a
 * new pick_lists row. Shared between the Dashboard quick action and the
 * Pick page's "+ Generate Pick List" button so the two don't drift.
 */
export async function generatePickList(supabase: SupabaseClient): Promise<GeneratePickListResult> {
  const { data: totes } = await supabase
    .from('totes').select('id, bin_location, customer_id').eq('status', 'pending_pick')

  if (!totes || totes.length === 0) {
    return { ok: false, error: 'No totes are currently pending pick.' }
  }

  const customerIds = [...new Set(totes.map(t => t.customer_id))]
  const { data: customers } = await supabase.from('customers').select('id, name').in('id', customerIds)
  const nameMap: Record<string, string> = {}
  ;(customers ?? []).forEach(c => { nameMap[c.id] = c.name })

  const binMap: Record<string, { tote_id: string; customer_name: string; status: 'pending' | 'picked' }[]> = {}
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

  if (error) return { ok: false, error: error.message }
  return { ok: true, id }
}
