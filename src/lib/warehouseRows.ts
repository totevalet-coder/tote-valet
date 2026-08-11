import type { SupabaseClient } from '@supabase/supabase-js'
import type { WarehouseRow } from '@/types/database'

// Floor Map / "Warehouse Editor" (TODO #10) — see schema.sql's
// "warehouse_rows table + locations.map_x/map_y" migration block for the
// full design rationale. A row's position/orientation is a property of the
// row as a unit (one warehouse_rows record per (warehouse_id, row)), not
// of each individual bin — bins within a row auto-line-up from the row's
// anchor in the direction its rotation implies.

/** All row layout records for a warehouse. Falls back to an empty list if
 * the migration hasn't been run yet, rather than erroring the page. */
export async function listWarehouseRows(supabase: SupabaseClient, warehouseId: string): Promise<WarehouseRow[]> {
  const { data } = await supabase.from('warehouse_rows').select('*').eq('warehouse_id', warehouseId)
  return (data ?? []) as WarehouseRow[]
}

/** Creates or updates one row's layout. Only the fields passed in `patch`
 * are written — on an existing row this leaves the others untouched (e.g.
 * dragging only touches map_x/map_y, rotating only touches rotation),
 * since Postgres upsert's ON CONFLICT DO UPDATE only sets the columns you
 * actually supply. On first touch (no existing record yet), any field not
 * passed falls back to its table default (0). */
export async function upsertWarehouseRow(
  supabase: SupabaseClient,
  warehouseId: string,
  row: string,
  patch: Partial<Pick<WarehouseRow, 'map_x' | 'map_y' | 'rotation'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('warehouse_rows')
    .upsert({ warehouse_id: warehouseId, row, ...patch }, { onConflict: 'warehouse_id,row' })
  return { error: error?.message ?? null }
}

/** Next default Y slot for a brand-new row (stacks below whatever's
 * already laid out) — used when a row is created via the New Row form so
 * it doesn't spawn on top of an existing one. Doesn't touch X or rotation. */
export function nextDefaultRowY(existingRows: WarehouseRow[]): number {
  if (existingRows.length === 0) return 0
  return Math.max(...existingRows.map(r => r.map_y)) + 1
}
