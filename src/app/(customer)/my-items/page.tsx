'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ToteCard from '@/components/ui/ToteCard'
import {
  Search,
  ChevronLeft,
  CheckCircle2,
  CalendarDays,
  Loader2,
  X,
  Package,
  Truck,
  ImageOff,
  Pencil,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react'
import type { Tote } from '@/types/database'

type FilterPill = 'all' | 'stored' | 'empty_at_customer' | 'in_transit'
type Tab = 'browse' | 'pickup' | 'return'

interface ToteWithPickup extends Tote {
  pickup_requested?: boolean
}

const FILTER_PILLS: { key: FilterPill; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stored', label: 'In Warehouse' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'empty_at_customer', label: 'At Home' },
]

function MyItemsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('browse')
  const [totes, setTotes] = useState<ToteWithPickup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterPill>(
    (searchParams.get('filter') as FilterPill) ?? 'all'
  )
  const [selectedTote, setSelectedTote] = useState<ToteWithPickup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<string[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [moveItemIdx, setMoveItemIdx] = useState<number | null>(null)
  const [savingItems, setSavingItems] = useState(false)
  const [emptyConfirm, setEmptyConfirm] = useState(false)

  // Return state
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [returnStep, setReturnStep] = useState<'select' | 'date' | 'done'>('select')
  const [submitting, setSubmitting] = useState(false)

  // Pickup state
  const [pickupSelected, setPickupSelected] = useState<Set<string>>(new Set())
  const [pickupStep, setPickupStep] = useState<'select' | 'date' | 'done'>('select')
  const [pickupDate, setPickupDate] = useState('')
  const [requestingPickup, setRequestingPickup] = useState(false)

  useEffect(() => {
    async function loadTotes() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) { router.push('/login'); return }

      const { data: customer } = await supabase
        .from('customers').select('id').eq('auth_id', userData.user.id).single()

      if (!customer) { setLoading(false); return }

      const { data } = await supabase
        .from('totes').select('*').eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      setTotes((data as ToteWithPickup[]) ?? [])
      setLoading(false)
    }
    loadTotes()
  }, [supabase, router])

  async function loadSignedUrls(tote: ToteWithPickup) {
    const paths = (tote as Tote & { photo_urls?: string[] }).photo_urls ?? []
    if (paths.length === 0) { setSignedUrls([]); return }
    setLoadingPhotos(true)
    try {
      const urls = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage.from('tote-photos').createSignedUrl(path, 3600)
          return data?.signedUrl ?? null
        })
      )
      setSignedUrls(urls.filter(Boolean) as string[])
    } catch {
      setSignedUrls([])
    } finally {
      setLoadingPhotos(false)
    }
  }

  async function handleRemoveItem(toteId: string, itemIdx: number) {
    setSavingItems(true)
    const tote = totes.find(t => t.id === toteId)
    if (!tote) { setSavingItems(false); return }
    const newItems = tote.items.filter((_, i) => i !== itemIdx)
    await supabase.from('totes').update({ items: newItems }).eq('id', toteId)
    const updated = { ...tote, items: newItems }
    setTotes(prev => prev.map(t => t.id === toteId ? updated : t))
    setSelectedTote(updated as ToteWithPickup)
    setSavingItems(false)
  }

  async function handleMoveItem(fromToteId: string, itemIdx: number, toToteId: string) {
    setSavingItems(true)
    const fromTote = totes.find(t => t.id === fromToteId)
    const toTote = totes.find(t => t.id === toToteId)
    if (!fromTote || !toTote) { setSavingItems(false); return }
    const movingItem = fromTote.items[itemIdx]
    const newFromItems = fromTote.items.filter((_, i) => i !== itemIdx)
    const newToItems = [...toTote.items, movingItem]
    await Promise.all([
      supabase.from('totes').update({ items: newFromItems }).eq('id', fromToteId),
      supabase.from('totes').update({ items: newToItems }).eq('id', toToteId),
    ])
    const updatedFrom = { ...fromTote, items: newFromItems }
    setTotes(prev => prev.map(t =>
      t.id === fromToteId ? updatedFrom :
      t.id === toToteId ? { ...toTote, items: newToItems } : t
    ))
    setSelectedTote(updatedFrom as ToteWithPickup)
    setMoveItemIdx(null)
    setSavingItems(false)
  }

  async function handleEmptyAll(toteId: string) {
    setSavingItems(true)
    await supabase.from('totes').update({ items: [] }).eq('id', toteId)
    const updated = { ...totes.find(t => t.id === toteId)!, items: [] }
    setTotes(prev => prev.map(t => t.id === toteId ? updated : t))
    setSelectedTote(updated as ToteWithPickup)
    setEmptyConfirm(false)
    setEditMode(false)
    setSavingItems(false)
  }

  const homeTotes = totes.filter(t => t.status === 'empty_at_customer' && !t.pickup_requested)
  const storedTotes = totes.filter(t => t.status === 'stored' || t.status === 'ready_to_stow')

  const filteredTotes = totes.filter(t => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'stored' && (t.status === 'stored' || t.status === 'ready_to_stow')) ||
      t.status === filter
    const matchesSearch =
      !search ||
      (t.tote_name?.toLowerCase().includes(search.toLowerCase())) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.items.some(i => i.label.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  function togglePickupSelect(id: string) {
    setPickupSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRequestPickup() {
    if (!pickupDate) { setError('Please choose a preferred pickup date.'); return }
    const ids = Array.from(pickupSelected)
    setRequestingPickup(true)
    setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')
      const { data: customer } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      // Mark totes as pickup_requested
      await supabase.from('totes').update({ pickup_requested: true }).in('id', ids)
      setTotes(prev => prev.map(t => ids.includes(t.id) ? { ...t, pickup_requested: true } : t))

      // Create tote_request record
      await supabase.from('tote_requests').insert({
        customer_id: customer.id,
        type: 'pickup',
        tote_ids: ids,
        preferred_date: pickupDate,
        status: 'pending',
      })

      setPickupStep('done')
    } catch {
      setError('Failed to request pickup. Please try again.')
    } finally {
      setRequestingPickup(false)
    }
  }

  function toggleReturnSelect(id: string) {
    setReturnSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleReturnSubmit() {
    if (!deliveryDate) { setError('Please choose a delivery date.'); return }
    setSubmitting(true)
    setError(null)
    try {
      await supabase.from('totes').update({ status: 'pending_pick' }).in('id', Array.from(returnSelected))
      setReturnStep('done')
    } catch {
      setError('Failed to submit return request.')
    } finally {
      setSubmitting(false)
    }
  }

  const TabBar = () => (
    <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
      {(['browse', 'pickup', 'return'] as Tab[]).map(t => (
        <button
          key={t}
          onClick={() => { setTab(t); setError(null) }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
            tab === t ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t === 'browse' ? 'My Items' : t === 'pickup' ? 'Request Pickup' : 'Request Return'}
        </button>
      ))}
    </div>
  )

  // ── Tote detail view ──
  if (selectedTote) {
    const otherTotes = totes.filter(t => t.id !== selectedTote.id)

    return (
      <div className="px-5 pt-6 pb-6 space-y-4">

        {/* Move item modal */}
        {moveItemIdx !== null && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setMoveItemIdx(null)}>
            <div className="bg-white w-full rounded-t-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-brand-navy">Move to which tote?</h3>
                <button onClick={() => setMoveItemIdx(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                Moving: <span className="font-semibold text-gray-700">{selectedTote.items[moveItemIdx]?.label}</span>
              </p>
              {otherTotes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No other totes available.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {otherTotes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleMoveItem(selectedTote.id, moveItemIdx, t.id)}
                      disabled={savingItems}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-brand-blue hover:bg-brand-blue/5 transition-all text-left"
                    >
                      <span className="text-xl">📦</span>
                      <div>
                        <p className="font-semibold text-brand-navy text-sm">{t.tote_name ?? t.id}</p>
                        <p className="text-xs text-gray-400">{t.items.length} items</p>
                      </div>
                      {savingItems && <Loader2 className="w-4 h-4 animate-spin text-brand-blue ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setMoveItemIdx(null)} className="w-full py-3 text-sm text-gray-500 font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Full-screen photo lightbox */}
        {expandedPhoto && (
          <div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            onClick={() => setExpandedPhoto(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expandedPhoto} alt="Tote photo" className="max-w-full max-h-full object-contain" />
            <button className="absolute top-4 right-4 bg-white/20 rounded-full p-2">
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        )}

        <button
          onClick={() => { setSelectedTote(null); setSignedUrls([]); setExpandedPhoto(null); setEditMode(false); setEmptyConfirm(false) }}
          className="flex items-center gap-1 text-brand-navy font-semibold text-sm"
        >
          <ChevronLeft className="w-5 h-5" /> Back to My Items
        </button>

        <div className="card space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-black text-brand-navy">{selectedTote.tote_name ?? selectedTote.id}</h2>
              <p className="text-gray-400 text-xs mt-0.5">ID: {selectedTote.id}</p>
              {selectedTote.seal_number && <p className="text-gray-400 text-xs">Seal: {selectedTote.seal_number}</p>}
            </div>
            <button
              onClick={() => { setEditMode(e => !e); setEmptyConfirm(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                editMode
                  ? 'bg-brand-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              {editMode ? 'Done' : 'Edit'}
            </button>
          </div>

          {/* Items */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Items ({selectedTote.items.length})</p>
            {selectedTote.items.length === 0 ? (
              <p className="text-gray-400 text-sm">No items logged in this tote.</p>
            ) : (
              <div className="space-y-1">
                {selectedTote.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-700 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400 text-xs w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="flex-1">{item.label}</span>
                    {item.ai_generated && !editMode && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">AI</span>
                    )}
                    {editMode && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setMoveItemIdx(i)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-blue-50 transition-colors"
                          title="Move to another tote"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveItem(selectedTote.id, i)}
                          disabled={savingItems}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Remove item"
                        >
                          {savingItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Empty All — only in edit mode, only if items exist */}
            {editMode && selectedTote.items.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                {emptyConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEmptyAll(selectedTote.id)}
                      disabled={savingItems}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {savingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Yes, remove all items
                    </button>
                    <button
                      onClick={() => setEmptyConfirm(false)}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEmptyConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-500 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Empty All Items
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Photo gallery */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Photos</p>
            {loadingPhotos ? (
              <div className="flex gap-2">
                {[1,2].map(i => <div key={i} className="w-20 h-20 rounded-xl bg-gray-200 animate-pulse" />)}
              </div>
            ) : signedUrls.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {signedUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setExpandedPhoto(url)}
                    className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <ImageOff className="w-4 h-4" />
                No photos for this tote
              </div>
            )}
          </div>
        </div>

        {selectedTote.status === 'empty_at_customer' && (
          selectedTote.pickup_requested ? (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-xl px-4 py-4 text-center">
              ✓ Pickup Requested — we&apos;ll be in touch to schedule
            </div>
          ) : (
            <button
              onClick={() => { setSelectedTote(null); setTab('pickup'); setPickupSelected(new Set([selectedTote.id])) }}
              className="btn-primary w-full"
            >
              Request Pickup for Storage
            </button>
          )
        )}

        {(selectedTote.status === 'stored' || selectedTote.status === 'ready_to_stow') && (
          <button
            onClick={() => { setReturnSelected(new Set([selectedTote.id])); setSelectedTote(null); setTab('return'); setReturnStep('date') }}
            className="btn-primary w-full"
          >
            Request This Tote Back
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── BROWSE TAB ── */}
      {tab === 'browse' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-brand-navy">My Items</h1>
          <TabBar />

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search totes or items..." className="input-field pl-10" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {FILTER_PILLS.map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-150 ${
                  filter === key ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
          ) : filteredTotes.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No totes found</p>
              <p className="text-gray-400 text-sm mt-1">Try a different filter or add some totes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTotes.map(tote => (
                <div key={tote.id} className="relative">
                  <ToteCard tote={tote} onClick={() => { setSelectedTote(tote); loadSignedUrls(tote) }} />
                  {tote.pickup_requested && (
                    <span className="absolute top-3 right-3 text-xs bg-brand-blue text-white font-semibold px-2 py-0.5 rounded-full">
                      Pickup Requested
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REQUEST PICKUP TAB ── */}
      {tab === 'pickup' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-brand-navy">Request Pickup</h1>
          <TabBar />

          {pickupStep === 'done' ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-black text-brand-navy mb-2">Pickup Requested!</h2>
              <p className="text-gray-500 text-sm mb-2">
                {pickupSelected.size} tote{pickupSelected.size !== 1 ? 's' : ''} scheduled for pickup.
              </p>
              <p className="text-gray-400 text-xs mb-6">
                Preferred date:{' '}
                {new Date(pickupDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <button onClick={() => { setPickupStep('select'); setPickupSelected(new Set()); setPickupDate(''); setTab('browse') }} className="btn-primary w-full">
                Back to My Items
              </button>
            </div>
          ) : pickupStep === 'date' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-brand-navy">Choose Pickup Date</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Scheduling pickup for {pickupSelected.size} tote{pickupSelected.size !== 1 ? 's' : ''}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preferred Pickup Date</label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={e => setPickupDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">We&apos;ll confirm the exact date once scheduled.</p>
              </div>
              <button
                onClick={handleRequestPickup}
                disabled={requestingPickup || !pickupDate}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {requestingPickup && <Loader2 className="w-4 h-4 animate-spin" />}
                <Truck className="w-4 h-4" />
                Confirm Pickup Request
              </button>
            </div>
          ) : homeTotes.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No totes ready for pickup</p>
              <p className="text-gray-400 text-sm mt-1">All your home totes have already been requested</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">Select which totes you&apos;d like us to pick up and bring to storage.</p>

              {/* Request All button */}
              <button
                onClick={() => { setPickupSelected(new Set(homeTotes.map(t => t.id))); setPickupStep('date') }}
                className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl px-6 py-4 font-bold hover:bg-blue-900 active:scale-[0.98] transition-all"
              >
                <Truck className="w-5 h-5" />
                Request All {homeTotes.length} Tote{homeTotes.length !== 1 ? 's' : ''} for Pickup
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-gray-50 px-3 text-xs text-gray-400">or select individual totes</span></div>
              </div>

              <div className="space-y-3">
                {homeTotes.map(tote => (
                  <button
                    key={tote.id}
                    onClick={() => togglePickupSelect(tote.id)}
                    className={`w-full card flex items-center gap-4 transition-all duration-150 ${
                      pickupSelected.has(tote.id) ? 'border-2 border-brand-blue bg-brand-blue/5 shadow-md' : 'hover:shadow-md'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center flex-shrink-0 text-xl">📦</div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-brand-navy text-sm truncate">{tote.tote_name ?? tote.id}</p>
                      <p className="text-xs text-gray-400">{tote.items.length} item{tote.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    {pickupSelected.has(tote.id) && <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                  </button>
                ))}
              </div>

              {pickupSelected.size > 0 && (
                <button
                  onClick={() => setPickupStep('date')}
                  className="btn-primary w-full"
                >
                  Request Pickup for {pickupSelected.size} Tote{pickupSelected.size !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── REQUEST RETURN TAB ── */}
      {tab === 'return' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-brand-navy">Request Return</h1>
          <TabBar />

          {returnStep === 'done' ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-black text-brand-navy mb-2">Return Requested!</h2>
              <p className="text-gray-500 text-sm mb-2">{returnSelected.size} tote{returnSelected.size > 1 ? 's' : ''} scheduled for delivery.</p>
              <p className="text-gray-400 text-xs mb-6">
                Estimated delivery:{' '}
                {new Date(deliveryDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">Back to Dashboard</button>
            </div>
          ) : returnStep === 'date' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-brand-navy">Choose Delivery Date</h2>
                <p className="text-sm text-gray-500 mt-1">Requesting {returnSelected.size} tote{returnSelected.size > 1 ? 's' : ''} back</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preferred Delivery Date</label>
                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} className="input-field" />
              </div>
              <button onClick={handleReturnSubmit} disabled={submitting}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <CalendarDays className="w-4 h-4" />
                Confirm Return Request
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-brand-navy">Select Totes to Return</h2>
                <p className="text-sm text-gray-500 mt-1">Choose from your stored totes</p>
              </div>

              {loading ? (
                <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
              ) : storedTotes.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No stored totes</p>
                  <p className="text-gray-400 text-sm mt-1">You have no totes currently in the warehouse</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {storedTotes.map(tote => (
                    <button key={tote.id} onClick={() => toggleReturnSelect(tote.id)}
                      className={`w-full card flex items-center gap-4 transition-all duration-150 ${
                        returnSelected.has(tote.id) ? 'border-2 border-brand-blue bg-brand-blue/5 shadow-md' : 'hover:shadow-md'
                      }`}>
                      <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center flex-shrink-0 text-xl">📦</div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-bold text-brand-navy text-sm truncate">{tote.tote_name ?? tote.id}</p>
                        <p className="text-xs text-gray-400">{tote.items.length} items</p>
                      </div>
                      {returnSelected.has(tote.id) && <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {returnSelected.size > 0 && (
                <button onClick={() => setReturnStep('date')} className="btn-primary w-full">
                  Confirm Selection ({returnSelected.size} Tote{returnSelected.size > 1 ? 's' : ''})
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyItemsPage() {
  return (
    <Suspense fallback={
      <div className="px-5 pt-6 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
        ))}
      </div>
    }>
      <MyItemsContent />
    </Suspense>
  )
}
