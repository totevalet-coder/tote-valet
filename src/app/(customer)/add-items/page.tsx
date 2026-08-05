'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Camera,
  Loader2,
  Plus,
  ChevronLeft,
  CheckCircle2,
  X,
} from 'lucide-react'
import type { ToteItem } from '@/types/database'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'
import ToteItemRow from '@/components/ui/ToteItemRow'
import { detectItemsFromPhoto } from '@/lib/aiLabel'

const MAX_PHOTOS = 5

interface DetectedItem {
  id: string
  label: string
  ai_generated: boolean
  accepted: boolean // false only for an AI-suggested label the customer hasn't confirmed yet
}

type WorkflowStep = 'tote' | 'items' | 'done'

export default function AddItemsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<WorkflowStep>('tote')
  const [items, setItems] = useState<DetectedItem[]>([{ id: crypto.randomUUID(), label: '', ai_generated: false, accepted: true }])
  const [toteName, setToteName] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [existingToteName, setExistingToteName] = useState<string | null>(null) // null = new tote, string = existing
  const [existingItems, setExistingItems] = useState<ToteItem[]>([]) // current inventory of a scanned/looked-up tote
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]) // signed URLs for that tote's existing photos
  const [lookingUp, setLookingUp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])      // storage paths
  const [photoThumbs, setPhotoThumbs] = useState<string[]>([])    // local blob URLs for preview
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  // Load customer ID on mount for storage path
  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const { data: c } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (c) setCustomerId(c.id)
    }
    load()
  }, [])

  // When a barcode is entered/scanned, look it up in the DB — including
  // current contents, so the customer can see what's already in there
  // (or that it's empty) before adding anything new.
  async function lookupTote(id: string) {
    const trimmed = id.trim().toUpperCase()
    if (!trimmed) { setExistingToteName(null); setExistingItems([]); setExistingPhotoUrls([]); return }
    setLookingUp(true)
    const { data } = await supabase.from('totes').select('tote_name, items, photo_urls').eq('id', trimmed).maybeSingle()
    if (data?.tote_name) {
      setExistingToteName(data.tote_name)
      setToteName(data.tote_name)
      setExistingItems((data.items as ToteItem[] | null) ?? [])
      await loadExistingPhotoUrls((data.photo_urls as string[] | null) ?? [])
    } else {
      setExistingToteName(null)
      setExistingItems([])
      setExistingPhotoUrls([])
    }
    setLookingUp(false)
  }

  // tote-photos is a private bucket (matches the pattern already used in
  // my-items) — resolve each stored path to a short-lived signed URL rather
  // than relying on a public read, which this bucket doesn't actually allow.
  async function loadExistingPhotoUrls(paths: string[]) {
    if (paths.length === 0) { setExistingPhotoUrls([]); return }
    const urls = await Promise.all(
      paths.map(async (path) => {
        const { data } = await supabase.storage.from('tote-photos').createSignedUrl(path, 3600)
        return data?.signedUrl ?? null
      })
    )
    setExistingPhotoUrls(urls.filter((u): u is string => !!u))
  }

  function addItem() {
    setItems(prev => [...prev, { id: crypto.randomUUID(), label: '', ai_generated: false, accepted: true }])
  }

  function updateItem(id: string, label: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, label } : i))
  }

  function acceptItem(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, accepted: true } : i))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // Upload photo to Supabase Storage, store path
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (existingPhotoUrls.length + photoPaths.length >= MAX_PHOTOS) { setError(`${MAX_PHOTOS} photo limit per tote.`); return }
    if (!customerId) { setError('Not logged in.'); return }

    // Show local preview immediately
    const thumb = URL.createObjectURL(file)
    setPhotoThumbs(prev => [...prev, thumb])
    setUploading(true)
    setError(null)

    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('tote-photos').upload(path, file)
      if (uploadError) throw uploadError
      setPhotoPaths(prev => [...prev, path])
    } catch {
      // Remove the preview if upload failed
      setPhotoThumbs(prev => prev.slice(0, -1))
      setError('Photo upload failed. Please try again.')
      setUploading(false)
      if (photoRef.current) photoRef.current.value = ''
      return
    }
    setUploading(false)
    if (photoRef.current) photoRef.current.value = ''

    // Ask Claude what's in the photo — non-blocking, manual entry still works if it fails
    setDetecting(true)
    const labels = await detectItemsFromPhoto(file)
    if (labels.length > 0) {
      const detected: DetectedItem[] = labels.map((label) => ({
        id: crypto.randomUUID(),
        label,
        ai_generated: true,
        accepted: false, // needs an explicit Accept before it's treated as confirmed
      }))
      setItems(prev => [...prev.filter(i => i.label.trim()), ...detected])
    }
    setDetecting(false)
  }

  function removePhoto(idx: number) {
    setPhotoPaths(prev => prev.filter((_, i) => i !== idx))
    setPhotoThumbs(prev => prev.filter((_, i) => i !== idx))
  }


  async function handleSave() {
    const validItems = items.filter(i => i.label.trim())
    if (validItems.length === 0) { setError('Add at least one item.'); return }
    if (!existingToteName && !toteName.trim()) { setError('Give this tote a name.'); return }

    setSaving(true)
    setError(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')

      const { data: customer } = await supabase
        .from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      const toteId = barcodeValue.trim() || `TV-${Math.floor(1000 + Math.random() * 9000)}`
      const toteItems: ToteItem[] = validItems.map(({ label, ai_generated }) => ({ label, ai_generated }))

      const { data: existing } = await supabase.from('totes').select('id, items, photo_urls').eq('id', toteId).single()

      if (existing) {
        const merged = [...(existing.items as ToteItem[]), ...toteItems]
        const existingPaths = (existing.photo_urls as string[] | null) ?? []
        const mergedPaths = [...existingPaths, ...photoPaths].slice(0, MAX_PHOTOS)
        const { error: e } = await supabase.from('totes').update({
          items: merged,
          tote_name: existingToteName ?? toteName,
          photo_urls: mergedPaths,
          last_scan_date: new Date().toISOString(),
        }).eq('id', existing.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('totes').insert({
          id: toteId, customer_id: customer.id, tote_name: toteName,
          seal_number: null, photo_url: photoPaths[0] ?? null,
          photo_urls: photoPaths,
          status: 'empty_at_customer', bin_location: null,
          last_scan_date: new Date().toISOString(), items: toteItems,
        })
        if (e) throw e
      }

      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-5 pt-6 pb-24 space-y-5">

      {/* Back button */}
      {step === 'items' && (
        <button onClick={() => setStep('tote')} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── STEP 1: Which Tote ── */}
      {step === 'tote' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Which tote?</h1>
            <p className="text-gray-500 text-sm mt-1">Scan or enter the tote barcode first, so we can show you what&apos;s already inside.</p>
          </div>

          {/* Barcode / ID entry */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tote Barcode / ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <BarcodeScanInput
              placeholder="TV-0001  or  leave blank for new tote"
              onScan={async val => {
                setBarcodeValue(val)
                await lookupTote(val)
              }}
            />
            {barcodeValue && (
              <div className="mt-3 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-green-600 font-medium">Tote ID captured</p>
                  <p className="text-lg font-black text-green-700 tracking-wider">{barcodeValue}</p>
                </div>
              </div>
            )}
            {lookingUp && (
              <p className="text-xs text-gray-400 mt-2">Looking up tote…</p>
            )}
          </div>

          {/* Existing tote found — show name + current inventory */}
          {existingToteName ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-green-800">Tote found: &ldquo;{existingToteName}&rdquo;</p>
                  <p className="text-xs text-green-600">New items will be added to this tote</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-2">
                    Currently in this tote {existingItems.length > 0 && `(${existingItems.length})`}
                  </p>
                  {existingItems.length > 0 ? (
                    <ul className="space-y-1.5">
                      {existingItems.map((it, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" /> {it.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic">This tote is empty.</p>
                  )}
                </div>

                {existingPhotoUrls.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Photos</p>
                    <div className="flex gap-2 flex-wrap">
                      {existingPhotoUrls.map((url, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Existing photo ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* No match (or nothing scanned yet) — new tote, ask for a nickname */
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Tote Nickname <span className="text-gray-400 font-normal">(new tote)</span>
              </label>
              <input
                type="text"
                value={toteName}
                onChange={e => setToteName(e.target.value)}
                placeholder="e.g. Winter Clothes, Holiday Decor..."
                className="input-field"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {['Winter Clothes', 'Holiday Decor', 'Sports Gear', 'Books', 'Kitchen'].map(s => (
                  <button key={s} onClick={() => setToteName(s)}
                    className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full hover:bg-brand-blue/10 hover:text-brand-blue transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setStep('items')}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── STEP 2: Items ── */}
      {step === 'items' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">What&apos;s in this tote?</h1>
            <p className="text-gray-500 text-sm mt-1">Add one item per line. Be as specific as you like.</p>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <ToteItemRow
                key={item.id}
                label={item.label}
                aiGenerated={item.ai_generated}
                needsAccept={item.ai_generated && !item.accepted}
                onLabelChange={label => updateItem(item.id, label)}
                onAccept={() => acceptItem(item.id)}
                onRemove={items.length > 1 ? () => removeItem(item.id) : undefined}
                placeholder={`Item ${idx + 1}`}
                autoFocus={idx === items.length - 1 && idx > 0}
              />
            ))}
          </div>

          {detecting && (
            <div className="flex items-center gap-2 text-xs text-brand-blue bg-brand-blue/5 rounded-lg px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Detecting items from photo…
            </div>
          )}

          <button
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Photos <span className="text-gray-400 font-normal">(optional, up to {MAX_PHOTOS} per tote)</span></p>
              <p className="text-xs text-gray-400">{existingPhotoUrls.length + photoPaths.length}/{MAX_PHOTOS}</p>
            </div>

            {/* Thumbnails */}
            {photoThumbs.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {photoThumbs.map((thumb, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx >= photoPaths.length ? (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                    ) : (
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {existingPhotoUrls.length + photoPaths.length < MAX_PHOTOS ? (
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-blue rounded-2xl py-5 text-brand-blue font-semibold hover:bg-brand-blue/5 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-6 h-6" />}
                {uploading ? 'Uploading…' : photoThumbs.length === 0 ? 'Take Photo of Contents' : 'Add Another Photo'}
              </button>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-center">
                {MAX_PHOTOS} photo limit per tote.
              </p>
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Items to add</span>
              <span className="font-semibold text-brand-navy">{items.filter(i => i.label.trim()).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tote</span>
              <span className="font-semibold text-brand-navy">
                {existingToteName ?? (toteName || (barcodeValue ? barcodeValue : 'New tote'))}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              if (items.filter(i => i.label.trim()).length === 0) {
                setError('Add at least one item.')
                return
              }
              setError(null)
              handleSave()
            }}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Items
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-brand-navy mb-2">Items Saved!</h2>
          <p className="text-gray-500 text-sm mb-6">
            {existingToteName
              ? <>Items added to &ldquo;<strong>{existingToteName}</strong>&rdquo;</>
              : <>&ldquo;<strong>{toteName}</strong>&rdquo; has been added to your account.</>
            }
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setStep('tote')
                setItems([{ id: crypto.randomUUID(), label: '', ai_generated: false, accepted: true }])
                setToteName('')
                setBarcodeValue('')
                setExistingToteName(null)
                setExistingItems([])
                setExistingPhotoUrls([])
                setPhotoPaths([])
                setPhotoThumbs([])
                setError(null)
              }}
              className="btn-secondary w-full"
            >
              Add Another Tote
            </button>
            <button onClick={() => { router.push('/dashboard'); router.refresh() }} className="btn-outline w-full">
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
