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
import type { ToteItem, ToteStatus } from '@/types/database'
import BarcodeScanInput from '@/components/ui/BarcodeScanInput'
import ToteItemRow from '@/components/ui/ToteItemRow'
import { detectItemsFromPhoto } from '@/lib/aiLabel'

const MAX_PHOTOS = 5

interface EditableItem {
  id: string
  label: string
  ai_generated: boolean
  accepted: boolean // false only for a freshly AI-suggested label not yet confirmed
}

interface ExistingPhoto {
  path: string // storage path — needed to delete
  url: string  // signed URL — for display
}

type Step = 'lookup' | 'edit' | 'done'

export default function EditTotePage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('lookup')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)

  const [toteId, setToteId] = useState('')
  const [toteName, setToteName] = useState('')
  const [status, setStatus] = useState<ToteStatus | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([])
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]) // storage cleanup on save
  const [newPhotoPaths, setNewPhotoPaths] = useState<string[]>([])
  const [newPhotoThumbs, setNewPhotoThumbs] = useState<string[]>([])

  const [uploading, setUploading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const editable = status === 'empty_at_customer'

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const { data: c } = await supabase.from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (c) setCustomerId(c.id)
    }
    load()
  }, [])

  async function lookupTote(id: string) {
    const trimmed = id.trim().toUpperCase()
    if (!trimmed) return
    setLookingUp(true)
    setNotFound(false)
    setError(null)

    // Defense-in-depth: scope the write side of this feature to the logged-in
    // customer's own totes explicitly, not just via RLS (Edit Totes does full
    // overwrites/deletes, unlike Add Items' append-only writes, so this is
    // worth being extra deliberate about rather than trusting RLS alone).
    let query = supabase.from('totes').select('id, tote_name, items, photo_urls, status').eq('id', trimmed)
    if (customerId) query = query.eq('customer_id', customerId)
    const { data } = await query.maybeSingle()

    if (!data) {
      setNotFound(true)
      setLookingUp(false)
      return
    }

    setToteId(data.id)
    setToteName(data.tote_name ?? '')
    setStatus(data.status)
    setItems(
      ((data.items as ToteItem[] | null) ?? []).map(i => ({
        id: crypto.randomUUID(),
        label: i.label,
        ai_generated: i.ai_generated ?? false,
        accepted: true, // already-saved items are already confirmed, not fresh suggestions
      }))
    )

    const paths = (data.photo_urls as string[] | null) ?? []
    if (paths.length > 0) {
      const resolved = await Promise.all(
        paths.map(async (path) => {
          const { data: signed } = await supabase.storage.from('tote-photos').createSignedUrl(path, 3600)
          return signed?.signedUrl ? { path, url: signed.signedUrl } : null
        })
      )
      setExistingPhotos(resolved.filter((p): p is ExistingPhoto => !!p))
    } else {
      setExistingPhotos([])
    }

    setLookingUp(false)
    setStep('edit')
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

  function removeExistingPhoto(path: string) {
    setExistingPhotos(prev => prev.filter(p => p.path !== path))
    setRemovedPhotoPaths(prev => [...prev, path])
  }

  function removeNewPhoto(idx: number) {
    setNewPhotoPaths(prev => prev.filter((_, i) => i !== idx))
    setNewPhotoThumbs(prev => prev.filter((_, i) => i !== idx))
  }

  const totalPhotoCount = existingPhotos.length + newPhotoPaths.length

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (totalPhotoCount >= MAX_PHOTOS) { setError(`${MAX_PHOTOS} photo limit per tote.`); return }
    if (!customerId) { setError('Not logged in.'); return }

    const thumb = URL.createObjectURL(file)
    setNewPhotoThumbs(prev => [...prev, thumb])
    setUploading(true)
    setError(null)

    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('tote-photos').upload(path, file)
      if (uploadError) throw uploadError
      setNewPhotoPaths(prev => [...prev, path])
    } catch {
      setNewPhotoThumbs(prev => prev.slice(0, -1))
      setError('Photo upload failed. Please try again.')
      setUploading(false)
      if (photoRef.current) photoRef.current.value = ''
      return
    }
    setUploading(false)
    if (photoRef.current) photoRef.current.value = ''

    setDetecting(true)
    const labels = await detectItemsFromPhoto(file)
    if (labels.length > 0) {
      const detected: EditableItem[] = labels.map(label => ({
        id: crypto.randomUUID(),
        label,
        ai_generated: true,
        accepted: false,
      }))
      setItems(prev => [...prev.filter(i => i.label.trim()), ...detected])
    }
    setDetecting(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')
      const { data: customer } = await supabase
        .from('customers').select('id').eq('auth_id', userData.user.id).single()
      if (!customer) throw new Error('Customer not found')

      const update: { tote_name: string; items?: ToteItem[]; photo_urls?: string[] } = {
        tote_name: toteName.trim() || toteId,
      }

      if (editable) {
        const validItems = items.filter(i => i.label.trim())
        if (validItems.length === 0) { setError('A tote needs at least one item, or request it be picked up empty.'); setSaving(false); return }
        update.items = validItems.map(({ label, ai_generated }) => ({ label, ai_generated }))
        update.photo_urls = [...existingPhotos.map(p => p.path), ...newPhotoPaths].slice(0, MAX_PHOTOS)
      }

      // Defense-in-depth: scope the update to this customer's own row explicitly.
      const { error: e } = await supabase.from('totes').update(update).eq('id', toteId).eq('customer_id', customer.id)
      if (e) throw e

      // Clean up any deleted photo files in storage — best-effort, not fatal
      // if it fails, the DB reference is already gone either way.
      if (removedPhotoPaths.length > 0) {
        await supabase.storage.from('tote-photos').remove(removedPhotoPaths).catch(() => {})
      }

      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setStep('lookup')
    setBarcodeValue('')
    setNotFound(false)
    setToteId('')
    setToteName('')
    setStatus(null)
    setItems([])
    setExistingPhotos([])
    setRemovedPhotoPaths([])
    setNewPhotoPaths([])
    setNewPhotoThumbs([])
    setError(null)
  }

  return (
    <div className="px-5 pt-6 pb-24 space-y-5">

      {step === 'edit' && (
        <button onClick={reset} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── LOOKUP ── */}
      {step === 'lookup' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Edit a Tote</h1>
            <p className="text-gray-500 text-sm mt-1">Scan or enter the tote barcode to load it.</p>
          </div>

          <BarcodeScanInput
            placeholder="TV-0001"
            onScan={async val => {
              setBarcodeValue(val)
              await lookupTote(val)
            }}
          />

          {lookingUp && (
            <p className="text-xs text-gray-400 mt-2">Looking up tote…</p>
          )}

          {notFound && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              We couldn&apos;t find tote &ldquo;{barcodeValue}&rdquo; on your account. Check the ID and try again.
            </div>
          )}
        </div>
      )}

      {/* ── EDIT ── */}
      {step === 'edit' && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">{toteName || toteId}</h1>
            <p className="text-gray-400 text-xs mt-1">{toteId}</p>
          </div>

          {/* Name — always editable, regardless of status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tote Nickname</label>
            <input
              type="text"
              value={toteName}
              onChange={e => setToteName(e.target.value)}
              placeholder="e.g. Winter Clothes, Holiday Decor..."
              className="input-field"
            />
          </div>

          {/* Items */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Items</label>
            {editable ? (
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
                  />
                ))}
                <button
                  onClick={addItem}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>
            ) : items.length > 0 ? (
              <ul className="space-y-1.5 bg-gray-50 rounded-xl p-4">
                {items.map(item => (
                  <ToteItemRow key={item.id} label={item.label} aiGenerated={item.ai_generated} readOnly />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 italic bg-gray-50 rounded-xl p-4">This tote is empty.</p>
            )}
          </div>

          {detecting && (
            <div className="flex items-center gap-2 text-xs text-brand-blue bg-brand-blue/5 rounded-lg px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Detecting items from photo…
            </div>
          )}

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Photos <span className="text-gray-400 font-normal">(up to {MAX_PHOTOS} per tote)</span></p>
              <p className="text-xs text-gray-400">{totalPhotoCount}/{MAX_PHOTOS}</p>
            </div>

            {(existingPhotos.length > 0 || newPhotoThumbs.length > 0) && (
              <div className="flex gap-2 flex-wrap mb-3">
                {existingPhotos.map(photo => (
                  <div key={photo.path} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="Tote photo" className="w-full h-full object-cover" />
                    {editable && (
                      <button
                        onClick={() => removeExistingPhoto(photo.path)}
                        className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
                {newPhotoThumbs.map((thumb, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={`New photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx >= newPhotoPaths.length ? (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                    ) : (
                      <button
                        onClick={() => removeNewPhoto(idx)}
                        className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {editable && (
              totalPhotoCount < MAX_PHOTOS ? (
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-blue rounded-2xl py-5 text-brand-blue font-semibold hover:bg-brand-blue/5 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-6 h-6" />}
                  {uploading ? 'Uploading…' : 'Add Photo'}
                </button>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-center">
                  {MAX_PHOTOS} photo limit per tote.
                </p>
              )
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-brand-navy mb-2">Saved!</h2>
          <p className="text-gray-500 text-sm mb-6">
            &ldquo;<strong>{toteName || toteId}</strong>&rdquo; has been updated.
          </p>
          <div className="space-y-3">
            <button onClick={reset} className="btn-secondary w-full">
              Edit Another Tote
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
