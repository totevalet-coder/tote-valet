'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Rows3, Boxes, Gauge, Plus, GripHorizontal, AlertTriangle, CheckCircle2,
  Map as MapIcon, List, Warehouse as WarehouseIcon, PackageOpen, ArrowUpDown, X,
} from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import type { Warehouse, Location, LocationType } from '@/types/database'
import { listWarehouses } from '@/lib/warehouses'
import WarehouseFloorMap from '@/components/admin/WarehouseFloorMap'

interface BinInfo {
  id: string
  row: string
  capacity: number
  current_count: number
}

const ZONE_TYPE_META: Record<LocationType, { label: string; icon: typeof PackageOpen; placeholder: string }> = {
  drop_zone:    { label: 'Drop Zones',    icon: PackageOpen,  placeholder: 'e.g. Dock, Dock2, InboundDock' },
  staging_zone: { label: 'Staging Zones', icon: ArrowUpDown,  placeholder: 'e.g. 01, 02' },
}

// How many pixels of drag == one more bin previewed. Tuned for a normal
// mouse drag to feel roughly 1:1 with cell height in the grid below.
const PX_PER_BIN = 28
const VISIBLE_PER_ROW = 5

function parseBinNum(id: string): number {
  const m = id.match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

function mode(nums: number[]): number {
  if (nums.length === 0) return 5
  const counts = new Map<number, number>()
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function binColor(b: BinInfo) {
  const pct = b.capacity > 0 ? b.current_count / b.capacity : 0
  if (pct >= 0.9) return 'bg-red-100 border-red-300 text-red-700'
  if (pct >= 0.6) return 'bg-amber-100 border-amber-300 text-amber-700'
  return 'bg-green-100 border-green-300 text-green-700'
}

export default function WarehouseSetupPage() {
  const supabase = createClient()
  const [bins, setBins] = useState<BinInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Multi-warehouse readiness — see CLAUDE.md's "Warehouses & Locations"
  // section. Bins themselves aren't warehouse-scoped yet (deliberately
  // deferred), so this selector only affects the Drop Zones/Staging Zones
  // section below. Defaults to WH1 — a no-op today since it's the only
  // warehouse that exists, but wired now so a second one doesn't need a
  // separate UI pass later.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [zoneCode, setZoneCode] = useState('')
  const [zoneType, setZoneType] = useState<LocationType>('drop_zone')
  const [zoneError, setZoneError] = useState('')
  const [creatingZone, setCreatingZone] = useState(false)

  // New Row form
  const [rowLetter, setRowLetter] = useState('')
  const [startingNum, setStartingNum] = useState('1')
  const [numBins, setNumBins] = useState('10')
  const [shelfCapacity, setShelfCapacity] = useState('5')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // Drag-to-fill state
  const [dragRow, setDragRow] = useState<string | null>(null)
  const [dragCount, setDragCount] = useState(0)
  const dragStartY = useRef(0)

  // Bin Layout has two views of the same data: the fast scannable list
  // (unchanged, still how bins get created) and the new Floor Map (purely
  // for arranging/visualizing what already exists) — see TODO #10.
  const [layoutTab, setLayoutTab] = useState<'list' | 'map'>('list')

  // Waits for the warehouses fetch to resolve once before bins load, so
  // bins aren't fetched unfiltered-then-refiltered (a visible flash of the
  // wrong stat numbers) once bins.warehouse_id exists.
  const [warehousesLoaded, setWarehousesLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!warehousesLoaded) return
    setLoading(true)
    // Pre-Phase-4-migration (warehouses.length === 0, selectedWarehouseId
    // ''), this stays unfiltered — bins.warehouse_id may not exist yet on
    // the live DB. Once it does, every bin has a warehouse_id (backfilled
    // to WH1), so filtering is always safe from then on.
    const query = supabase.from('bins').select('id, row, capacity, current_count').order('id')
    const { data } = await (selectedWarehouseId ? query.eq('warehouse_id', selectedWarehouseId) : query)
    setBins((data ?? []) as BinInfo[])
    setLoading(false)
  }, [supabase, selectedWarehouseId, warehousesLoaded])

  useEffect(() => { load() }, [load])

  // Warehouses — loaded once. Falls back to an empty list gracefully if the
  // multi-warehouse migration hasn't been run yet (see CLAUDE.md), rather
  // than erroring the whole page.
  useEffect(() => {
    listWarehouses(supabase).then(list => {
      setWarehouses(list)
      if (list.length > 0) setSelectedWarehouseId(prev => prev || list[0].id)
      setWarehousesLoaded(true)
    })
  }, [supabase])

  const loadLocations = useCallback(async () => {
    if (!selectedWarehouseId) { setLocations([]); return }
    const { data } = await supabase.from('locations').select('*').eq('warehouse_id', selectedWarehouseId).order('code')
    setLocations((data ?? []) as Location[])
  }, [supabase, selectedWarehouseId])

  useEffect(() => { loadLocations() }, [loadLocations])

  async function createZone() {
    setZoneError('')
    const code = zoneCode.trim()
    if (!code) { setZoneError('Enter a name for this zone.'); return }
    if (!selectedWarehouseId) { setZoneError('Select a warehouse first.'); return }

    setCreatingZone(true)
    const { error } = await supabase.from('locations').insert({
      warehouse_id: selectedWarehouseId,
      type: zoneType,
      code,
    })
    setCreatingZone(false)
    if (error) { setZoneError(error.message); return }

    setZoneCode('')
    setSaveMsg(`Added ${ZONE_TYPE_META[zoneType].label.replace(/s$/, '')} "${code}"`)
    setTimeout(() => setSaveMsg(null), 3000)
    loadLocations()
  }

  async function deleteZone(id: string) {
    await supabase.from('locations').delete().eq('id', id)
    loadLocations()
  }

  const rows = [...new Set(bins.map(b => b.row))].sort()
  const defaultCapacity = mode(bins.map(b => b.capacity))

  // bins.id is one global unique text PK (see schema.sql's Phase 4 note) —
  // it's never renamed for existing WH1 bins, but any warehouse other than
  // the default (code 'WH1') gets its new bin IDs prefixed with its own
  // code, so "A-12" in WH1 and "WH2-A-12" in WH2 can't collide and the ID
  // itself carries which building it's in, matching the physical label.
  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId)
  const isDefaultWarehouse = !selectedWarehouse || selectedWarehouse.code === 'WH1'
  const binIdPrefix = isDefaultWarehouse ? '' : `${selectedWarehouse.code}-`

  async function createRow() {
    setCreateError('')
    const letter = rowLetter.trim().toUpperCase()
    const start = parseInt(startingNum, 10)
    const count = parseInt(numBins, 10)
    const capacity = parseInt(shelfCapacity, 10)

    if (!letter || letter.length !== 1) { setCreateError('Row letter must be a single character.'); return }
    if (!Number.isFinite(start) || start < 1) { setCreateError('Starting bin # must be at least 1.'); return }
    if (!Number.isFinite(count) || count < 1 || count > 100) { setCreateError('Number of bins must be between 1 and 100.'); return }
    if (!Number.isFinite(capacity) || capacity < 0) { setCreateError('Shelf capacity must be 0 or more.'); return }
    if (warehouses.length > 0 && !selectedWarehouseId) { setCreateError('Select a warehouse first.'); return }

    const newIds = Array.from({ length: count }, (_, i) => `${binIdPrefix}${letter}-${String(start + i).padStart(2, '0')}`)

    setCreating(true)
    const { data: existing } = await supabase.from('bins').select('id').in('id', newIds)
    if (existing && existing.length > 0) {
      setCreateError(`These bins already exist: ${existing.map(b => b.id).join(', ')}`)
      setCreating(false)
      return
    }

    const { error } = await supabase.from('bins').insert(
      newIds.map(id => ({
        id, row: letter, capacity, current_count: 0,
        ...(selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
      }))
    )
    if (error) { setCreateError(error.message); setCreating(false); return }

    setSaveMsg(`Created ${count} bins in Row ${letter}`)
    setTimeout(() => setSaveMsg(null), 3000)
    setRowLetter(''); setStartingNum('1'); setNumBins('10'); setShelfCapacity(String(defaultCapacity))
    setCreating(false)
    load()
  }

  function startDrag(e: React.PointerEvent, row: string) {
    e.preventDefault()
    dragStartY.current = e.clientY
    setDragRow(row)
    setDragCount(0)

    function onMove(ev: PointerEvent) {
      const delta = ev.clientY - dragStartY.current
      setDragCount(Math.max(0, Math.round(delta / PX_PER_BIN)))
    }
    async function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const delta = ev.clientY - dragStartY.current
      const count = Math.max(0, Math.round(delta / PX_PER_BIN))
      if (count > 0) await commitDragFill(row, count)
      setDragRow(null)
      setDragCount(0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Floor Map's bin-capacity edits happen inside that component (it writes
  // to Supabase itself); this just keeps the list view / stat cards in
  // sync afterward without a full refetch.
  function handleCapacityChange(binId: string, newCapacity: number) {
    setBins(prev => prev.map(b => b.id === binId ? { ...b, capacity: newCapacity } : b))
  }

  async function commitDragFill(row: string, count: number) {
    const rowBins = bins.filter(b => b.row === row)
    const maxNum = Math.max(0, ...rowBins.map(b => parseBinNum(b.id)))
    const capacity = mode(rowBins.map(b => b.capacity))
    const newIds = Array.from({ length: count }, (_, i) => `${binIdPrefix}${row}-${String(maxNum + 1 + i).padStart(2, '0')}`)

    const { data: existing } = await supabase.from('bins').select('id').in('id', newIds)
    if (existing && existing.length > 0) return // silently skip on collision, drag is best-effort

    await supabase.from('bins').insert(newIds.map(id => ({
      id, row, capacity, current_count: 0,
      ...(selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
    })))
    setSaveMsg(`Added ${count} bin${count !== 1 ? 's' : ''} to Row ${row}`)
    setTimeout(() => setSaveMsg(null), 3000)
    load()
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-black text-2xl text-brand-navy">Warehouse Setup</h1>
        {warehouses.length > 0 && (
          <div className="flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-gray-400" />
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="text-xs font-bold rounded-xl px-3 py-2.5 border-2 border-gray-200 text-gray-600"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        <StatCard label="Rows Configured" value={rows.length} icon={Rows3} />
        <StatCard label="Total Bins" value={bins.length} icon={Boxes} />
        <StatCard label="Default Shelf Capacity" value={defaultCapacity} subtext="Totes stacked per bin" icon={Gauge} />
      </div>

      {saveMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700 max-w-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {saveMsg}
        </div>
      )}

      {/* Bin Layout */}
      <section className="space-y-4">
        <div>
          <h2 className="font-bold text-brand-navy">Bin Layout</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Drag a row&apos;s fill handle down to auto-label new bins — same as dragging a formula down. Or build from
            here directly: rows of bins, Excel-style, so labeling 20 bins isn&apos;t 20 manual entries.
            {warehouses.length > 0 && (
              <> Scoped to <span className="font-semibold">{selectedWarehouse?.code ?? 'this warehouse'}</span> — switch warehouses above to manage another building&apos;s bins.</>
            )}
          </p>
        </div>

        {/* New Row form */}
        <div className="card space-y-3 max-w-2xl">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Row</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Row Letter {!isDefaultWarehouse && <span className="text-gray-300 font-normal normal-case">(labeled {binIdPrefix}{rowLetter || 'F'}-##)</span>}
              </label>
              <input type="text" maxLength={1} value={rowLetter} onChange={e => setRowLetter(e.target.value.toUpperCase())}
                className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center uppercase" placeholder="F" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Starting Bin #</label>
              <input type="number" min={1} value={startingNum} onChange={e => setStartingNum(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Number of Bins</label>
              <input type="number" min={1} max={100} value={numBins} onChange={e => setNumBins(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Shelf Capacity</label>
              <input type="number" min={0} value={shelfCapacity} onChange={e => setShelfCapacity(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
            </div>
            <button
              onClick={createRow} disabled={creating}
              className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-blue-900 transition-colors disabled:opacity-60"
            >
              <Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'Create Row'}
            </button>
          </div>
          {createError && (
            <div className="flex items-start gap-2 text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {createError}
            </div>
          )}
        </div>

        {/* List / Floor Map tabs — two views of the same bin data. List is
            still how bins get created (New Row form above); Floor Map is
            purely for arranging/visualizing what already exists. */}
        <div className="flex bg-gray-100 rounded-xl p-1 w-fit">
          {([['list', 'List', List], ['map', 'Floor Map', MapIcon]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setLayoutTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                layoutTab === id ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {layoutTab === 'map' ? (
          warehouses.length > 0 && selectedWarehouseId ? (
            <WarehouseFloorMap warehouseId={selectedWarehouseId} bins={bins} onCapacityChange={handleCapacityChange} />
          ) : (
            <p className="text-center text-gray-400 text-sm py-12">
              Floor Map needs the multi-warehouse migration run first — select a warehouse above once it has.
            </p>
          )
        ) : rows.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No bins configured yet — create your first row above.</p>
        ) : (
          <div className="space-y-4">
            {rows.map(row => {
              const rowBins = bins.filter(b => b.row === row).sort((a, b) => parseBinNum(a.id) - parseBinNum(b.id))
              const cap = mode(rowBins.map(b => b.capacity))
              const visible = rowBins.length > VISIBLE_PER_ROW + 1 ? rowBins.slice(0, VISIBLE_PER_ROW) : rowBins.slice(0, -1)
              const lastBin = rowBins[rowBins.length - 1]
              const hiddenCount = rowBins.length - visible.length - 1
              const isDragging = dragRow === row

              return (
                <div key={row}>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Row {row} · {rowBins.length} bins · capacity {cap}
                  </h3>
                  <div className="flex flex-wrap gap-2 items-start">
                    {visible.map(b => (
                      <div key={b.id} className={`rounded-xl border-2 px-3 py-2.5 text-center w-20 ${binColor(b)}`}>
                        <p className="font-black text-xs">{b.id}</p>
                        <p className="text-[10px] font-semibold">{b.current_count}/{b.capacity}</p>
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <div className="rounded-xl border-2 border-dashed border-gray-200 px-3 py-2.5 text-center w-20 flex items-center justify-center text-gray-400 text-xs font-semibold">
                        +{hiddenCount} more
                      </div>
                    )}
                    {lastBin && (
                      <div className="relative">
                        <div className={`rounded-xl border-2 px-3 py-2.5 text-center w-20 ${binColor(lastBin)}`}>
                          <p className="font-black text-xs">{lastBin.id}</p>
                          <p className="text-[10px] font-semibold">{lastBin.current_count}/{lastBin.capacity}</p>
                        </div>
                        {/* Fill handle */}
                        <button
                          onPointerDown={e => startDrag(e, row)}
                          title="Drag down to add more bins to this row"
                          className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-brand-blue rounded flex items-center justify-center cursor-ns-resize shadow touch-none"
                        >
                          <GripHorizontal className="w-3 h-3 text-white" />
                        </button>
                        {/* Ghost preview cells while dragging */}
                        {isDragging && dragCount > 0 && (
                          <div className="absolute top-full left-0 mt-2 flex flex-col gap-2">
                            {Array.from({ length: dragCount }, (_, i) => {
                              const nextNum = parseBinNum(lastBin.id) + 1 + i
                              return (
                                <div key={i} className="rounded-xl border-2 border-dashed border-brand-blue/40 bg-brand-blue/5 px-3 py-2.5 text-center w-20">
                                  <p className="font-black text-xs text-brand-blue/60">{binIdPrefix}{row}-{String(nextNum).padStart(2, '0')}</p>
                                  <p className="text-[10px] text-brand-blue/40">new</p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend — list view only; the Floor Map has its own built in */}
        {layoutTab === 'list' && (
          <div className="flex gap-4 justify-center pt-2">
            {[
              { color: 'bg-green-200', label: '< 60%' },
              { color: 'bg-amber-200', label: '60–90%' },
              { color: 'bg-red-200', label: '> 90%' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Drop Zones & Staging Zones */}
      <section className="space-y-4">
        <div>
          <h2 className="font-bold text-brand-navy">Drop Zones &amp; Staging Zones</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Not physically sized like bins — just named spots on the floor where totes wait, scoped to{' '}
            {warehouses.find(w => w.id === selectedWarehouseId)?.code ?? 'this warehouse'}. Unlimited per warehouse.
          </p>
        </div>

        {warehouses.length === 0 ? (
          <p className="text-sm text-gray-400 italic max-w-2xl">
            No warehouses found — the multi-warehouse migration may not have been run yet.
          </p>
        ) : (
          <>
            {/* Add zone form */}
            <div className="card space-y-3 max-w-2xl">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Zone</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                  <select
                    value={zoneType}
                    onChange={e => { setZoneType(e.target.value as LocationType); setZoneError('') }}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="drop_zone">Drop Zone</option>
                    <option value="staging_zone">Staging Zone</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Name <span className="text-gray-300 font-normal">({warehouses.find(w => w.id === selectedWarehouseId)?.code ?? 'WH'}-{zoneType === 'drop_zone' ? 'DZ' : 'STG'}-…)</span>
                  </label>
                  <input
                    type="text" value={zoneCode} onChange={e => { setZoneCode(e.target.value); setZoneError('') }}
                    placeholder={ZONE_TYPE_META[zoneType].placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={createZone} disabled={creatingZone}
                  className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-blue-900 transition-colors disabled:opacity-60"
                >
                  <Plus className="w-4 h-4" /> {creatingZone ? 'Adding…' : 'Add Zone'}
                </button>
              </div>
              {zoneError && (
                <div className="flex items-start gap-2 text-xs text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {zoneError}
                </div>
              )}
            </div>

            {/* Existing zones, grouped by type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {(Object.keys(ZONE_TYPE_META) as LocationType[]).map(type => {
                const meta = ZONE_TYPE_META[type]
                const Icon = meta.icon
                const zones = locations.filter(l => l.type === type)
                return (
                  <div key={type} className="card space-y-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" /> {meta.label} ({zones.length})
                    </p>
                    {zones.length === 0 ? (
                      <p className="text-xs text-gray-300 italic">None yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {zones.map(z => (
                          <div key={z.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                            <span className="text-sm font-mono font-semibold text-brand-navy flex-1">{z.code}</span>
                            <button onClick={() => deleteZone(z.id)} title="Remove zone">
                              <X className="w-3.5 h-3.5 text-gray-300 hover:text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
