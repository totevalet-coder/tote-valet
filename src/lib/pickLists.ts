import type { SupabaseClient } from '@supabase/supabase-js'
import { todayStr } from './date'
import { getDefaultWarehouseId } from './warehouses'

export type GeneratePickListResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Pulls every `pending_pick` tote in the target warehouse, groups it by bin
 * (walk-order, not route-aware — this is the existing "location-based" pick
 * mode), and inserts a new pick_lists row. Shared between the Dashboard
 * quick action and the Pick page's "+ Generate Pick List" button so the two
 * don't drift.
 *
 * `warehouseId` defaults to the single seeded warehouse so existing callers
 * work unchanged. Now that `bins.warehouse_id` exists (Phase 4, see
 * CLAUDE.md's Warehouses & Locations section), totes are filtered to only
 * those actually stored in a bin belonging to this warehouse — a WH2 pick
 * list can no longer include a tote sitting in a WH1 bin. `bin_location` is
 * a free-text bin id, not a warehouse-aware FK itself, so this has to join
 * against `bins` rather than trust the tote row alone. Totes with no
 * `bin_location` at all (a pre-existing, unrelated data-quality edge case)
 * keep going into the "UNASSIGNED" bucket on every warehouse's pick list,
 * same as before this change — deliberately not touched here.
 */
export async function generatePickList(supabase: SupabaseClient, warehouseId?: string): Promise<GeneratePickListResult> {
  const resolvedWarehouseId = warehouseId ?? await getDefaultWarehouseId(supabase)

  const { data: allPendingTotes } = await supabase
    .from('totes').select('id, bin_location, customer_id').eq('status', 'pending_pick')

  if (!allPendingTotes || allPendingTotes.length === 0) {
    return { ok: false, error: 'No totes are currently pending pick.' }
  }

  let totes = allPendingTotes
  if (resolvedWarehouseId) {
    const binIds = [...new Set(allPendingTotes.map(t => t.bin_location).filter((v): v is string => !!v))]
    const { data: binsInWarehouse } = binIds.length > 0
      ? await supabase.from('bins').select('id').eq('warehouse_id', resolvedWarehouseId).in('id', binIds)
      : { data: [] as { id: string }[] }
    const validBinIds = new Set((binsInWarehouse ?? []).map(b => b.id))
    totes = allPendingTotes.filter(t => !t.bin_location || validBinIds.has(t.bin_location))
  }

  if (totes.length === 0) {
    return { ok: false, error: 'No totes are currently pending pick in this warehouse.' }
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
