import type { SupabaseClient } from '@supabase/supabase-js'
import type { Warehouse } from '@/types/database'

// Multi-warehouse readiness — see CLAUDE.md's "Warehouses & Locations"
// section for the full design. Today there's exactly one seeded warehouse
// (code 'WH1'); these helpers exist so no page has to hand-roll its own
// "which warehouse" lookup as more get added — mirrors how
// src/lib/warehousePool.ts centralizes the Warehouse Pool customer id.

let cachedDefaultId: string | null = null

/** The current default warehouse's id (today, always WH1's). Cached for
 * the session since it practically never changes. */
export async function getDefaultWarehouseId(supabase: SupabaseClient): Promise<string | null> {
  if (cachedDefaultId) return cachedDefaultId
  const { data } = await supabase.from('warehouses').select('id').eq('code', 'WH1').maybeSingle()
  cachedDefaultId = data?.id ?? null
  return cachedDefaultId
}

/** All warehouses, ordered by code (WH1, WH2, ...). */
export async function listWarehouses(supabase: SupabaseClient): Promise<Warehouse[]> {
  const { data } = await supabase.from('warehouses').select('*').order('code')
  return data ?? []
}
