'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Location, LocationType, WarehouseRow } from '@/types/database'
import { listWarehouseRows, upsertWarehouseRow } from '@/lib/warehouseRows'
import { RotateCw, GripVertical, PackageOpen, ArrowUpDown, MapPin } from 'lucide-react'

// Floor Map / "Warehouse Editor" (TODO #10) — see schema.sql's
// "warehouse_rows table + locations.map_x/map_y" migration for the full
// design rationale and the user's confirmed decisions. Two distinct
// rotation mechanisms live here on purpose, not one:
//   - `viewRotation` (this component's own state, 4-way, never persisted)
//     — lets the operator spin the whole map to match which way they're
//     facing on the floor. Pure viewing transform.
//   - each row's own `rotation` (persisted, 2-way: horizontal/vertical)
//     — real layout data, since rows don't all run the same direction.
// Bin/row CREATION still happens via the existing "New Row" form (see the
// parent page) — this component only arranges/visualizes what exists,
// edits individual bin capacity, and places zones.

interface BinInfo {
  id: string
  row: string
  capacity: number
  current_count: number
}

interface Props {
  warehouseId: string
  bins: BinInfo[]
  onCapacityChange: (binId: string, newCapacity: number) => void
}

// Grid cells, not pixels — matches the Excel-drag-to-fill metaphor already
// used elsewhere in Warehouse Setup (whole-number positions, not freeform).
const CELL = 48

const ZONE_META: Record<LocationType, { icon: typeof PackageOpen; color: string; label: string }> = {
  drop_zone:    { icon: PackageOpen, color: 'bg-amber-100 border-amber-400 text-amber-700',  label: 'Drop Zone' },
  staging_zone: { icon: ArrowUpDown, color: 'bg-purple-100 border-purple-400 text-purple-700', label: 'Staging Zone' },
}

function parseBinNum(id: string): number {
  const m = id.match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

function binColor(b: BinInfo) {
  const pct = b.capacity > 0 ? b.current_count / b.capacity : 0
  if (pct >= 0.9) return 'bg-red-100 border-red-300 text-red-700'
  if (pct >= 0.6) return 'bg-amber-100 border-amber-300 text-amber-700'
  return 'bg-green-100 border-green-300 text-green-700'
}

// Rotates a grid point by a multiple of 90° (screen convention: +x right,
// +y down, positive degrees clockwise — matches CSS `rotate()`).
// Math.cos/sin on exact multiples of 90° leave tiny float error (e.g.
// 6.1e-17 instead of 0) — rounding immediately keeps every downstream
// calculation in exact integers.
function rotatePoint(x: number, y: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  const c = Math.round(Math.cos(rad))
  const s = Math.round(Math.sin(rad))
  return { x: x * c - y * s, y: x * s + y * c }
}

// Inverse of rotatePoint, applied to a movement delta — converts a
// screen-space drag delta back into true grid-space delta so dragging
// still feels natural no matter how the view is currently rotated.
function unrotateDelta(dx: number, dy: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  const c = Math.round(Math.cos(rad))
  const s = Math.round(Math.sin(rad))
  return { dx: dx * c + dy * s, dy: -dx * s + dy * c }
}

export default function WarehouseFloorMap({ warehouseId, bins, onCapacityChange }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [zones, setZones] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [viewRotation, setViewRotation] = useState<0 | 90 | 180 | 270>(0)
  const [dragPreview, setDragPreview] = useState<{ key: string; x: number; y: number } | null>(null)

  const [editingBin, setEditingBin] = useState<BinInfo | null>(null)
  const [editCapacity, setEditCapacity] = useState('')
  const [savingBin, setSavingBin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rowsData, zonesRes] = await Promise.all([
      listWarehouseRows(supabase, warehouseId),
      supabase.from('locations').select('*').eq('warehouse_id', warehouseId),
    ])
    setRows(rowsData)
    setZones((zonesRes.data ?? []) as Location[])
    setLoading(false)
  }, [supabase, warehouseId])

  useEffect(() => { load() }, [load])

  const rowNames = useMemo(() => [...new Set(bins.map(b => b.row))].sort(), [bins])

  // Effective layout: real warehouse_rows record where one exists, else a
  // sensible in-memory default (stacked, horizontal) — rendered but not
  // written until the user actually drags/rotates that row. Live drag
  // preview overrides both, so movement feels instant, not round-trip-y.
  const rowLayout = useMemo(() => {
    const byName = new Map(rows.map(r => [r.row, r]))
    return rowNames.map((name, i) => {
      const base = byName.get(name) ?? ({
        id: `__default_${name}`, warehouse_id: warehouseId, row: name,
        map_x: 0, map_y: i, rotation: 0, created_at: '',
      } as WarehouseRow)
      const preview = dragPreview?.key === `row:${name}` ? dragPreview : null
      return preview ? { ...base, map_x: preview.x, map_y: preview.y } : base
    })
  }, [rowNames, rows, warehouseId, dragPreview])

  const placedZones = useMemo(() => zones
    .filter(z => z.map_x != null && z.map_y != null)
    .map(z => {
      const preview = dragPreview?.key === `zone:${z.id}` ? dragPreview : null
      return preview ? { ...z, map_x: preview.x, map_y: preview.y } : z
    }), [zones, dragPreview])

  const unplacedZones = useMemo(() => zones.filter(z => z.map_x == null || z.map_y == null), [zones])

  // Every bin's true grid position: row anchor + its offset along whichever
  // axis the row's own rotation implies.
  const binPositions = useMemo(() => {
    const result: { bin: BinInfo; gx: number; gy: number; row: WarehouseRow; isFirst: boolean }[] = []
    for (const rowMeta of rowLayout) {
      const rowBins = bins.filter(b => b.row === rowMeta.row).sort((a, b) => parseBinNum(a.id) - parseBinNum(b.id))
      rowBins.forEach((bin, i) => {
        const [ox, oy] = rowMeta.rotation === 90 ? [0, i] : [i, 0]
        result.push({ bin, gx: rowMeta.map_x + ox, gy: rowMeta.map_y + oy, row: rowMeta, isFirst: i === 0 })
      })
    }
    return result
  }, [rowLayout, bins])

  // Apply the view rotation on top of true grid positions, then normalize
  // so everything renders at non-negative screen coordinates.
  const { screenBins, screenZones, canvasW, canvasH } = useMemo(() => {
    const rBins = binPositions.map(p => ({ ...p, ...rotatePoint(p.gx, p.gy, viewRotation) }))
    const rZones = placedZones.map(z => ({ ...z, ...rotatePoint(z.map_x!, z.map_y!, viewRotation) }))
    const xs = [...rBins.map(b => b.x), ...rZones.map(z => z.x)]
    const ys = [...rBins.map(b => b.y), ...rZones.map(z => z.y)]
    const minX = xs.length ? Math.min(...xs) : 0
    const minY = ys.length ? Math.min(...ys) : 0
    const maxX = xs.length ? Math.max(...xs) : 0
    const maxY = ys.length ? Math.max(...ys) : 0
    return {
      screenBins: rBins.map(b => ({ ...b, sx: b.x - minX, sy: b.y - minY })),
      screenZones: rZones.map(z => ({ ...z, sx: z.x - minX, sy: z.y - minY })),
      canvasW: (maxX - minX + 1) * CELL,
      canvasH: (maxY - minY + 1) * CELL,
    }
  }, [binPositions, placedZones, viewRotation])

  function startRowDrag(e: React.PointerEvent, rowMeta: WarehouseRow) {
    e.preventDefault()
    e.stopPropagation()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const origX = rowMeta.map_x
    const origY = rowMeta.map_y
    let liveX = origX
    let liveY = origY

    function onMove(ev: PointerEvent) {
      const { dx, dy } = unrotateDelta((ev.clientX - startClientX) / CELL, (ev.clientY - startClientY) / CELL, viewRotation)
      liveX = Math.max(0, origX + Math.round(dx))
      liveY = Math.max(0, origY + Math.round(dy))
      setDragPreview({ key: `row:${rowMeta.row}`, x: liveX, y: liveY })
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragPreview(null)
      if (liveX !== origX || liveY !== origY) {
        setRows(prev => {
          const exists = prev.some(r => r.row === rowMeta.row)
          return exists
            ? prev.map(r => r.row === rowMeta.row ? { ...r, map_x: liveX, map_y: liveY } : r)
            : [...prev, { ...rowMeta, map_x: liveX, map_y: liveY }]
        })
        await upsertWarehouseRow(supabase, warehouseId, rowMeta.row, { map_x: liveX, map_y: liveY })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  async function toggleRowRotation(rowMeta: WarehouseRow) {
    const next = rowMeta.rotation === 90 ? 0 : 90
    setRows(prev => {
      const exists = prev.some(r => r.row === rowMeta.row)
      return exists
        ? prev.map(r => r.row === rowMeta.row ? { ...r, rotation: next } : r)
        : [...prev, { ...rowMeta, rotation: next }]
    })
    await upsertWarehouseRow(supabase, warehouseId, rowMeta.row, { rotation: next })
  }

  function startZoneDrag(e: React.PointerEvent, zone: Location) {
    e.preventDefault()
    e.stopPropagation()
    if (zone.map_x == null || zone.map_y == null) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const origX = zone.map_x
    const origY = zone.map_y
    let liveX = origX
    let liveY = origY

    function onMove(ev: PointerEvent) {
      const { dx, dy } = unrotateDelta((ev.clientX - startClientX) / CELL, (ev.clientY - startClientY) / CELL, viewRotation)
      liveX = Math.max(0, origX + Math.round(dx))
      liveY = Math.max(0, origY + Math.round(dy))
      setDragPreview({ key: `zone:${zone.id}`, x: liveX, y: liveY })
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragPreview(null)
      if (liveX !== origX || liveY !== origY) {
        setZones(prev => prev.map(z => z.id === zone.id ? { ...z, map_x: liveX, map_y: liveY } : z))
        await supabase.from('locations').update({ map_x: liveX, map_y: liveY }).eq('id', zone.id)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // First placement is a click, not a literal drag from a tray — converting
  // a pointer's raw screen position into a canvas grid cell (accounting for
  // scroll offset AND view rotation) is real added complexity for a
  // one-time action. Drops it at the map's origin; full drag-to-reposition
  // (above) takes over from there for getting it exactly right.
  async function placeZone(zone: Location) {
    const { error } = await supabase.from('locations').update({ map_x: 0, map_y: 0 }).eq('id', zone.id)
    if (!error) setZones(prev => prev.map(z => z.id === zone.id ? { ...z, map_x: 0, map_y: 0 } : z))
  }

  function rotateView() {
    setViewRotation(prev => (((prev + 90) % 360) as 0 | 90 | 180 | 270))
  }

  async function saveCapacity() {
    if (!editingBin) return
    const newCap = parseInt(editCapacity, 10)
    if (!Number.isFinite(newCap) || newCap < 0) return
    setSavingBin(true)
    const { error } = await supabase.from('bins').update({ capacity: newCap }).eq('id', editingBin.id)
    if (!error) { onCapacityChange(editingBin.id, newCap); setEditingBin(null) }
    setSavingBin(false)
  }

  if (loading) {
    return <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
  }

  if (bins.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-12">No bins in this warehouse yet — add a row under Bin Layout first.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-400 max-w-md">
          Drag a row&apos;s <GripVertical className="w-3 h-3 inline -mt-0.5" /> handle to reposition it, tap its ↻ to
          flip it horizontal/vertical. Click any bin to override its capacity. Drag a placed zone pin to move it.
        </p>
        <button
          onClick={rotateView}
          className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-3 py-2 text-xs font-bold hover:bg-blue-900 transition-colors flex-shrink-0"
          title="Rotate the whole map view 90° — doesn't change any stored layout"
        >
          <RotateCw className="w-3.5 h-3.5" /> Rotate View
        </button>
      </div>

      {unplacedZones.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-3">
          <p className="text-xs font-bold text-gray-400 w-full uppercase tracking-wide">Not yet placed on map</p>
          {unplacedZones.map(z => {
            const meta = ZONE_META[z.type]
            const Icon = meta.icon
            return (
              <button
                key={z.id}
                onClick={() => placeZone(z)}
                className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold ${meta.color}`}
              >
                <Icon className="w-3 h-3" /> {z.code}
                <span className="text-[10px] opacity-70 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> click to place</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative overflow-auto border-2 border-gray-100 rounded-2xl bg-gray-50" style={{ maxHeight: 560 }}>
        <div className="relative" style={{ width: Math.max(canvasW + CELL * 2, 320), height: Math.max(canvasH + CELL * 2, 320) }}>
          {screenBins.map(({ bin, sx, sy, isFirst, row: rowMeta }) => (
            <div key={bin.id} style={{ position: 'absolute', left: sx * CELL + CELL, top: sy * CELL + CELL, width: CELL - 4, height: CELL - 4 }}>
              {isFirst && (
                <div
                  onPointerDown={e => startRowDrag(e, rowMeta)}
                  className="absolute -top-6 left-0 flex items-center gap-1 bg-brand-navy text-white rounded-md px-1.5 py-0.5 text-[10px] font-bold cursor-move select-none z-10 whitespace-nowrap touch-none"
                  title="Drag to move this row"
                >
                  <GripVertical className="w-2.5 h-2.5" /> {rowMeta.row}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => toggleRowRotation(rowMeta)}
                    className="ml-0.5 hover:text-brand-blue"
                    title="Flip this row horizontal/vertical"
                  >
                    <RotateCw className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <button
                onClick={() => { setEditingBin(bin); setEditCapacity(String(bin.capacity)) }}
                className={`w-full h-full rounded-md border-2 flex flex-col items-center justify-center text-[9px] font-bold leading-tight ${binColor(bin)}`}
                title={`${bin.id} — ${bin.current_count}/${bin.capacity}`}
              >
                <span className="truncate max-w-full px-0.5">{bin.id}</span>
                <span className="opacity-70">{bin.current_count}/{bin.capacity}</span>
              </button>
            </div>
          ))}

          {screenZones.map(pz => {
            const meta = ZONE_META[pz.type]
            const Icon = meta.icon
            return (
              <div
                key={pz.id}
                onPointerDown={e => startZoneDrag(e, pz)}
                style={{ position: 'absolute', left: pz.sx * CELL + CELL, top: pz.sy * CELL + CELL, width: CELL - 4, height: CELL - 4 }}
                className={`rounded-md border-2 flex flex-col items-center justify-center cursor-move select-none touch-none ${meta.color}`}
                title={`${pz.code} — drag to reposition`}
              >
                <Icon className="w-3 h-3" />
                <span className="text-[8px] font-bold truncate max-w-full px-0.5">{pz.code}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center pt-1">
        {[
          { color: 'bg-green-200', label: 'Bin < 60%' },
          { color: 'bg-amber-200', label: 'Bin 60–90%' },
          { color: 'bg-red-200', label: 'Bin > 90%' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        {(Object.keys(ZONE_META) as LocationType[]).map(t => (
          <div key={t} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${ZONE_META[t].color.split(' ')[0]}`} />
            <span className="text-xs text-gray-500">{ZONE_META[t].label}</span>
          </div>
        ))}
      </div>

      {editingBin && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center px-4" onClick={() => setEditingBin(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-72 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-black text-brand-navy">{editingBin.id}</p>
            <p className="text-xs text-gray-400">Currently holding {editingBin.current_count} tote{editingBin.current_count !== 1 ? 's' : ''}</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Capacity</label>
              <input
                type="number" min={0} value={editCapacity} onChange={e => setEditCapacity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingBin(null)} className="flex-1 border-2 border-gray-200 text-gray-600 rounded-xl py-2 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={saveCapacity} disabled={savingBin} className="flex-1 bg-brand-navy text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-60">
                {savingBin ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
