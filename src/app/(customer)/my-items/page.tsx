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
  Plus,
  Trash2,
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
  const [homeSubFilter, setHomeSubFilter] = useState<'all' | 'full' | 'empty'>('all')
  const [selectedTote, setSelectedTote] = useState<ToteWithPickup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<string[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)

  // Return state
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [returnStep, setReturnStep] = useState<'select' | 'date' | 'done'>('select')
  const [submitting, setSubmitting] = useState(false)

  // Pickup state
  const [pickupMode, setPickupMode] = useState<'storage' | 'return_empties'>('storage')
  const [pickupSelected, setPickupSelected] = useState<Set<string>>(new Set())
  const [pickupStep, setPickupStep] = useState<'select' | 'confirm' | 'date' | 'done'>('select')
  const [pickupDate, setPickupDate] = useState('')
  const [requestingPickup, setRequestingPickup] = useState(false)

  // Return empty totes state
  const [emptyReturnSelected, setEmptyReturnSelected] = useState<Set<string>>(new Set())
  const [emptyReturnDate, setEmptyReturnDate] = useState('')
  const [emptyReturnStep, setEmptyReturnStep] = useState<'select' | 'date' | 'done'>('select')
  const [submittingEmptyReturn, setSubmittingEmptyReturn] = useState(false)

  // Inventory confirmation state
  const [confirmIdx, setConfirmIdx] = useState(0)
  const [confirmChangeMode, setConfirmChangeMode] = useState<null | 'choice' | 'remove'>(null)
  const [confirmRemoveSelected, setConfirmRemoveSelected] = useState<Set<number>>(new Set())
  const [confirmUrls, setConfirmUrls] = useState<string[]>([])
  const [confirmLoadingUrls, setConfirmLoadingUrls] = useState(false)
  const [confirmSaving, setConfirmSaving] = useState(false)

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

  async function loadConfirmUrls(tote: ToteWithPickup) {
    const paths = (tote as Tote & { photo_urls?: string[] }).photo_urls ?? []
    if (paths.length === 0) { setConfirmUrls([]); return }
    setConfirmLoadingUrls(true)
    try {
      const urls = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage.from('tote-photos').createSignedUrl(path, 3600)
          return data?.signedUrl ?? null
        })
      )
      setConfirmUrls(urls.filter(Boolean) as string[])
    } catch {
      setConfirmUrls([])
    } finally {
      setConfirmLoadingUrls(false)
    }
  }

  function enterConfirmStep(selected: Set<string>) {
    setConfirmIdx(0)
    setConfirmChangeMode(null)
    setConfirmRemoveSelected(new Set())
    setConfirmUrls([])
    setPickupStep('confirm')
    const firstTote = totes.find(t => selected.has(t.id))
    if (firstTote) loadConfirmUrls(firstTote)
  }

  function confirmAdvance(pickupTotesArr: ToteWithPickup[]) {
    const next = confirmIdx + 1
    setConfirmChangeMode(null)
    setConfirmRemoveSelected(new Set())
    if (next >= pickupTotesArr.length) {
      setPickupStep('date')
    } else {
      setConfirmIdx(next)
      loadConfirmUrls(pickupTotesArr[next])
    }
  }

  async function handleConfirmRemoveSave(toteId: string, pickupTotesArr: ToteWithPickup[]) {
    setConfirmSaving(true)
    const tote = totes.find(t => t.id === toteId)
    if (!tote) { setConfirmSaving(false); return }
    const newItems = tote.items.filter((_, i) => !confirmRemoveSelected.has(i))
    await supabase.from('totes').update({ items: newItems }).eq('id', toteId)
    const updated = { ...tote, items: newItems } as ToteWithPickup
    setTotes(prev => prev.map(t => t.id === toteId ? updated : t))
    setConfirmRemoveSelected(new Set())
    setConfirmChangeMode(null)
    setConfirmSaving(false)
    // Reload photos for the refreshed tote view
    loadConfirmUrls(updated)
  }

  const storageReadyTotes = totes.filter(t => t.status === 'empty_at_customer' && !t.pickup_requested && t.items.length > 0)
  const emptyReturnTotes = totes.filter(t => t.status === 'empty_at_customer' && !t.pickup_requested && t.items.length === 0)
  const storedTotes = totes.filter(t => t.status === 'stored' || t.status === 'ready_to_stow')

  const filteredTotes = totes.filter(t => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'stored' && (t.status === 'stored' || t.status === 'ready_to_stow')) ||
      t.status === filter
    const matchesSubFilter =
      filter !== 'empty_at_customer' ||
      homeSubFilter === 'all' ||
      (homeSubFilter === 'full' && t.items.length > 0) ||
      (homeSubFilter === 'empty' && t.items.length === 0)
    const matchesSearch =
      !search ||
      (t.tote_name?.toLowerCase().includes(search.toLowerCase())) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.items.some(i => i.label.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSubFilter && matchesSearch
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

  async function handleReturnEmpties() {
    if (!emptyReturnDate) { setError('Please choose a pickup date.'); return }
    const ids = Array.from(emptyReturnSelected)
    setSubmittingEmptyReturn(true)
    setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')
      const { data: customer } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      await supabase.from('totes').update({ pickup_requested: true }).in('id', ids)
      setTotes(prev => prev.map(t => ids.includes(t.id) ? { ...t, pickup_requested: true } : t))

      await supabase.from('tote_requests').insert({
        customer_id: customer.id,
        type: 'empty_tote_return',
        tote_ids: ids,
        preferred_date: emptyReturnDate,
        status: 'pending',
      })

      setEmptyReturnStep('done')
    } catch {
      setError('Failed to schedule return. Please try again.')
    } finally {
      setSubmittingEmptyReturn(false)
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
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')
      const { data: customer } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      const ids = Array.from(returnSelected)
      await supabase.from('totes').update({ status: 'pending_pick' }).in('id', ids)
      await supabase.from('tote_requests').insert({
        customer_id: customer.id,
        type: 'tote_return',
        tote_ids: ids,
        preferred_date: deliveryDate,
        status: 'pending',
      })

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
    return (
      <div className="px-5 pt-6 pb-6 space-y-4">
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

        <button onClick={() => { setSelectedTote(null); setSignedUrls([]); setExpandedPhoto(null) }} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
          <ChevronLeft className="w-5 h-5" /> Back to My Items
        </button>

        <div className="card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-black text-brand-navy">{selectedTote.tote_name ?? selectedTote.id}</h2>
              <p className="text-gray-400 text-xs mt-0.5">ID: {selectedTote.id}</p>
              {selectedTote.seal_number && <p className="text-gray-400 text-xs">Seal: {selectedTote.seal_number}</p>}
            </div>
            <span className="text-3xl">📦</span>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Items ({selectedTote.items.length})</p>
            {selectedTote.items.length === 0 ? (
              <p className="text-gray-400 text-sm">No items logged in this tote.</p>
            ) : (
              <div className="space-y-1">
                {selectedTote.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-700 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400 text-xs w-5">{i + 1}.</span>
                    <span className="flex-1">{item.label}</span>
                    {item.ai_generated && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">AI</span>
                    )}
                  </div>
                ))}
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
          ) : selectedTote.items.length > 0 ? (
            <button
              onClick={() => { setSelectedTote(null); setTab('pickup'); setPickupMode('storage'); setPickupSelected(new Set([selectedTote.id])) }}
              className="btn-primary w-full"
            >
              Request Pickup for Storage
            </button>
          ) : (
            <button
              onClick={() => { setSelectedTote(null); setTab('pickup'); setPickupMode('return_empties'); setEmptyReturnSelected(new Set([selectedTote.id])) }}
              className="btn-primary w-full"
            >
              Return This Tote to Tote Valet
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
              <button key={key} onClick={() => { setFilter(key); setHomeSubFilter('all') }}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-150 ${
                  filter === key ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-blue'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* At Home sub-filter */}
          {filter === 'empty_at_customer' && (
            <div className="flex gap-2 -mt-1">
              {(['all', 'full', 'empty'] as const).map(sub => (
                <button
                  key={sub}
                  onClick={() => setHomeSubFilter(sub)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                    homeSubFilter === sub
                      ? 'bg-brand-blue text-white border-brand-blue'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-brand-blue'
                  }`}
                >
                  {sub === 'all' ? 'All' : sub === 'full' ? '📦 Full' : '⬜ Empty'}
                </button>
              ))}
            </div>
          )}

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

          {/* Mode toggle — hidden once deep in a flow */}
          {pickupStep !== 'confirm' && pickupStep !== 'done' && emptyReturnStep !== 'done' && (
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => { setPickupMode('storage'); setPickupStep('select'); setPickupSelected(new Set()) }}
                className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${pickupMode === 'storage' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Send to Storage
              </button>
              <button
                onClick={() => { setPickupMode('return_empties'); setEmptyReturnStep('select'); setEmptyReturnSelected(new Set()) }}
                className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${pickupMode === 'return_empties' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Return Empty Totes
              </button>
            </div>
          )}

          {/* ── Storage pickup sub-flow ── */}
          {pickupMode === 'storage' && (
            <>
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
                  <button onClick={() => { setPickupStep('select'); setPickupSelected(new Set()); setPickupDate(''); setConfirmIdx(0); setConfirmChangeMode(null); setConfirmRemoveSelected(new Set()); setConfirmUrls([]); setTab('browse') }} className="btn-primary w-full">
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
              ) : pickupStep === 'confirm' ? (() => {
            const pickupTotesArr = totes.filter(t => pickupSelected.has(t.id))
            const currentTote = pickupTotesArr[confirmIdx]
            if (!currentTote) return null
            return (
              <div className="space-y-4">
                {/* Progress header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-brand-navy">Confirm Inventory</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Tote {confirmIdx + 1} of {pickupTotesArr.length}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {pickupTotesArr.map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 rounded-full transition-all ${
                          i < confirmIdx ? 'w-4 bg-green-400' :
                          i === confirmIdx ? 'w-6 bg-brand-blue' :
                          'w-4 bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Tote card */}
                <div className="card space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📦</span>
                    <div>
                      <h3 className="font-black text-brand-navy">{currentTote.tote_name ?? currentTote.id}</h3>
                      <p className="text-xs text-gray-400">ID: {currentTote.id}</p>
                    </div>
                  </div>

                  {/* Items list — remove mode shows checkboxes */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Items ({currentTote.items.length})
                      {confirmChangeMode === 'remove' && (
                        <span className="ml-2 text-xs text-red-500 font-normal">Tap items to remove</span>
                      )}
                    </p>
                    {currentTote.items.length === 0 ? (
                      <p className="text-gray-400 text-sm">No items logged in this tote.</p>
                    ) : (
                      <div className="space-y-1">
                        {currentTote.items.map((item, i) => (
                          <button
                            key={i}
                            disabled={confirmChangeMode !== 'remove'}
                            onClick={() => {
                              if (confirmChangeMode !== 'remove') return
                              setConfirmRemoveSelected(prev => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i); else next.add(i)
                                return next
                              })
                            }}
                            className={`w-full flex items-center gap-2 text-sm py-2 px-2 rounded-lg transition-all text-left ${
                              confirmChangeMode === 'remove'
                                ? confirmRemoveSelected.has(i)
                                  ? 'bg-red-50 border border-red-200 text-red-700 line-through'
                                  : 'hover:bg-red-50 hover:border-red-200 border border-transparent text-gray-700'
                                : 'text-gray-700'
                            }`}
                          >
                            {confirmChangeMode === 'remove' ? (
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                confirmRemoveSelected.has(i) ? 'bg-red-500 border-red-500' : 'border-gray-300'
                              }`}>
                                {confirmRemoveSelected.has(i) && <X className="w-3 h-3 text-white" />}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs w-5 flex-shrink-0">{i + 1}.</span>
                            )}
                            <span className="flex-1">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Photos */}
                  {confirmChangeMode !== 'remove' && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Photos</p>
                      {confirmLoadingUrls ? (
                        <div className="flex gap-2">
                          {[1,2].map(i => <div key={i} className="w-20 h-20 rounded-xl bg-gray-200 animate-pulse" />)}
                        </div>
                      ) : confirmUrls.length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                          {confirmUrls.map((url, i) => (
                            <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <ImageOff className="w-4 h-4" />
                          No photos for this tote
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action area */}
                {confirmChangeMode === null && (
                  <div className="space-y-2">
                    <button
                      onClick={() => confirmAdvance(pickupTotesArr)}
                      className="w-full flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-4 rounded-2xl hover:bg-green-600 active:scale-[0.98] transition-all"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Looks Good — {confirmIdx + 1 < pickupTotesArr.length ? 'Next Tote' : 'Choose Pickup Date'}
                    </button>
                    <button
                      onClick={() => setConfirmChangeMode('choice')}
                      className="w-full py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
                    >
                      Changes Needed
                    </button>
                  </div>
                )}

                {confirmChangeMode === 'choice' && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-700 text-center">What needs to change?</p>
                    <button
                      onClick={() => router.push(`/add-items`)}
                      className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white font-bold py-4 rounded-2xl hover:bg-blue-900 active:scale-[0.98] transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      Add Items to This Tote
                    </button>
                    <button
                      onClick={() => { setConfirmChangeMode('remove'); setConfirmRemoveSelected(new Set()) }}
                      className="w-full flex items-center justify-center gap-2 border-2 border-red-300 text-red-600 font-bold py-4 rounded-2xl hover:bg-red-50 active:scale-[0.98] transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                      Remove Items from This Tote
                    </button>
                    <button
                      onClick={() => setConfirmChangeMode(null)}
                      className="w-full py-3 text-gray-400 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {confirmChangeMode === 'remove' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleConfirmRemoveSave(currentTote.id, pickupTotesArr)}
                      disabled={confirmRemoveSelected.size === 0 || confirmSaving}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 text-white font-bold py-4 rounded-2xl hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      {confirmSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                      Remove {confirmRemoveSelected.size} Item{confirmRemoveSelected.size !== 1 ? 's' : ''}
                    </button>
                    <button
                      onClick={() => { setConfirmChangeMode(null); setConfirmRemoveSelected(new Set()) }}
                      className="w-full py-3 text-gray-400 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
              })() : storageReadyTotes.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No packed totes ready for pickup</p>
                  <p className="text-gray-400 text-sm mt-1">Pack some items into a tote first, then request a pickup</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Select which totes you&apos;d like us to pick up and bring to storage.</p>

                  <button
                    onClick={() => { const all = new Set(storageReadyTotes.map(t => t.id)); setPickupSelected(all); enterConfirmStep(all) }}
                    className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl px-6 py-4 font-bold hover:bg-blue-900 active:scale-[0.98] transition-all"
                  >
                    <Truck className="w-5 h-5" />
                    Request All {storageReadyTotes.length} Tote{storageReadyTotes.length !== 1 ? 's' : ''} for Pickup
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center"><span className="bg-gray-50 px-3 text-xs text-gray-400">or select individual totes</span></div>
                  </div>

                  <div className="space-y-3">
                    {storageReadyTotes.map(tote => (
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
                      onClick={() => enterConfirmStep(pickupSelected)}
                      className="btn-primary w-full"
                    >
                      Review &amp; Confirm Inventory ({pickupSelected.size} Tote{pickupSelected.size !== 1 ? 's' : ''})
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Return empty totes sub-flow ── */}
          {pickupMode === 'return_empties' && (
            <>
              {emptyReturnStep === 'done' ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-black text-brand-navy mb-2">Return Scheduled!</h2>
                  <p className="text-gray-500 text-sm mb-2">
                    {emptyReturnSelected.size} empty tote{emptyReturnSelected.size !== 1 ? 's' : ''} scheduled for return.
                  </p>
                  <p className="text-gray-400 text-xs mb-6">
                    Preferred date:{' '}
                    {new Date(emptyReturnDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  <button onClick={() => { setEmptyReturnStep('select'); setEmptyReturnSelected(new Set()); setEmptyReturnDate(''); setPickupMode('storage'); setTab('browse') }} className="btn-primary w-full">
                    Back to My Items
                  </button>
                </div>
              ) : emptyReturnStep === 'date' ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-brand-navy">Choose Pickup Date</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      We&apos;ll collect {emptyReturnSelected.size} empty tote{emptyReturnSelected.size !== 1 ? 's' : ''} from your door
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preferred Date</label>
                    <input
                      type="date"
                      value={emptyReturnDate}
                      onChange={e => setEmptyReturnDate(e.target.value)}
                      min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                      className="input-field"
                    />
                    <p className="text-xs text-gray-400 mt-1">We&apos;ll confirm the exact date once scheduled.</p>
                  </div>
                  <button
                    onClick={handleReturnEmpties}
                    disabled={submittingEmptyReturn || !emptyReturnDate}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submittingEmptyReturn && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Truck className="w-4 h-4" />
                    Schedule Collection
                  </button>
                </div>
              ) : emptyReturnTotes.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No empty totes at home</p>
                  <p className="text-gray-400 text-sm mt-1">You have no empty totes to return right now</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Select the empty totes you&apos;d like us to collect from your door.</p>

                  <button
                    onClick={() => { setEmptyReturnSelected(new Set(emptyReturnTotes.map(t => t.id))); setEmptyReturnStep('date') }}
                    className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-2xl px-6 py-4 font-bold hover:bg-blue-900 active:scale-[0.98] transition-all"
                  >
                    <Truck className="w-5 h-5" />
                    Return All {emptyReturnTotes.length} Empty Tote{emptyReturnTotes.length !== 1 ? 's' : ''}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center"><span className="bg-gray-50 px-3 text-xs text-gray-400">or select individual totes</span></div>
                  </div>

                  <div className="space-y-3">
                    {emptyReturnTotes.map(tote => (
                      <button
                        key={tote.id}
                        onClick={() => {
                          setEmptyReturnSelected(prev => {
                            const next = new Set(prev)
                            if (next.has(tote.id)) next.delete(tote.id); else next.add(tote.id)
                            return next
                          })
                        }}
                        className={`w-full card flex items-center gap-4 transition-all duration-150 ${
                          emptyReturnSelected.has(tote.id) ? 'border-2 border-brand-blue bg-brand-blue/5 shadow-md' : 'hover:shadow-md'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center flex-shrink-0 text-xl">🗃️</div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-bold text-brand-navy text-sm truncate">{tote.tote_name ?? tote.id}</p>
                          <p className="text-xs text-gray-400">Empty tote</p>
                        </div>
                        {emptyReturnSelected.has(tote.id) && <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                      </button>
                    ))}
                  </div>

                  {emptyReturnSelected.size > 0 && (
                    <button
                      onClick={() => setEmptyReturnStep('date')}
                      className="btn-primary w-full"
                    >
                      Schedule Collection ({emptyReturnSelected.size} Tote{emptyReturnSelected.size !== 1 ? 's' : ''})
                    </button>
                  )}
                </>
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
