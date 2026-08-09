import type { SupabaseClient } from '@supabase/supabase-js'
import { todayStr } from './date'
import { getDefaultWarehouseId } from './warehouses'

export type GeneratePickListResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Pulls every `pending_pick` tote, groups it by bin (walk-order, not route-
 * aware — this is the existing "location-based" pick mode), and inserts a
 * new pick_lists row. Shared between the Dashboard quick action and the
 * Pick page's "+ Generate Pick List" button so the two don't drift.
 *
 * `warehouseId` defaults to the single seeded warehouse so existing callers
 * work unchanged. Known limitation: since `bins` isn't warehouse-scoped yet
 * (deliberately deferred — see CLAUDE.md's Warehouses & Locations section),
 * this only tags the resulting pick_lists row with a warehouse; it doesn't
 * yet filter which bins/totes get pulled to just that warehouse's own bins.
 */
export async function generatePickList(supabase: SupabaseClient, warehouseId?: string): Promise<GeneratePickListResult> {
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
  // Derived from the business-local calendar date (todayStr()), not raw
  // Date math on `now` — that implicitly used whatever timezone the
  // viewing browser happened to be in, which "usually" matches the
  // business (Eastern) but isn't guaranteed, and is exactly the class of
  // bug this whole date.ts module exists to close off.
  const [year, month, day] = todayStr().split('-').map(Number)
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1
  const baseId = `PL-${year}-${String(dayOfYear).padStart(3, '0')}`
  const { data: existing } = await supabase.from('pick_lists').select('id').eq('id', baseId).maybeSingle()
  const id = existing ? `${baseId}-B` : baseId

  const bins = Object.entries(binMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bin_id, toteList]) => ({ bin_id, totes: toteList }))

  // pick_lists.generated_by is a foreign key to customers(id), NOT the
  // Supabase auth user id (auth.users.id) — those are two different UUIDs
  // in this schema (customers has its own id, plus a separate auth_id FK).
  // Passing the raw auth id here violates the FK constraint.
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false, error: 'Not logged in.' }
  const { data: me } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
  if (!me) return { ok: false, error: 'Could not find your customer record.' }

  const resolvedWarehouseId = warehouseId ?? await getDefaultWarehouseId(supabase)

  const { error } = await supabase.from('pick_lists').insert({
    id,
    generated_by: me.id,
    generated_at: now.toISOString(),
    status: 'ready',
    assigned_to: null,
    bins,
    completed_at: null,
    ...(resolvedWarehouseId ? { warehouse_id: resolvedWarehouseId } : {}),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id }
}
