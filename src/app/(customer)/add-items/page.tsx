'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Camera,
  QrCode,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react'
import type { ToteItem } from '@/types/database'

interface DetectedItem {
  id: string
  label: string
  ai_generated: boolean
}

type WorkflowStep = 'items' | 'details' | 'done'

export default function AddItemsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<WorkflowStep>('items')
  const [items, setItems] = useState<DetectedItem[]>([{ id: crypto.randomUUID(), label: '', ai_generated: false }])
  const [toteName, setToteName] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  function addItem() {
    setItems(prev => [...prev, { id: crypto.randomUUID(), label: '', ai_generated: false }])
  }

  function updateItem(id: string, label: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, label } : i))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // Take photo for reference (AI disabled — saved as tote photo)
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturedImageUrl(URL.createObjectURL(file))
  }

  // Decode barcode from a photo taken with camera
  async function handleBarcodePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // Use BarcodeDetector if available (Chrome Android, Safari 17+)
      if ('BarcodeDetector' in window) {
        const detector = new (window as Window & { BarcodeDetector: new (opts: object) => { detect: (img: HTMLImageElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] })
        const img = new Image()
        img.src = URL.createObjectURL(file)
        await new Promise(r => img.onload = r)
        const results = await detector.detect(img)
        if (results.length > 0) {
          setBarcodeValue(results[0].rawValue.toUpperCase())
          return
        }
      }
      // Fallback: try html5-qrcode file decode
      const { Html5Qrcode } = await import('html5-qrcode')
      const result = await Html5Qrcode.scanFile(file, false)
      setBarcodeValue(result.toUpperCase())
    } catch {
      setError('Could not read barcode. Enter the Tote ID manually below.')
    }
  }

  async function handleSave() {
    const validItems = items.filter(i => i.label.trim())
    if (validItems.length === 0) { setError('Add at least one item.'); return }
    if (!toteName.trim()) { setError('Give this tote a name.'); return }

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

      const { data: existing } = await supabase.from('totes').select('id, items').eq('id', toteId).single()

      if (existing) {
        const merged = [...(existing.items as ToteItem[]), ...toteItems]
        const { error: e } = await supabase.from('totes').update({ items: merged, tote_name: toteName, last_scan_date: new Date().toISOString() }).eq('id', existing.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('totes').insert({
          id: toteId, customer_id: customer.id, tote_name: toteName,
          seal_number: null, photo_url: capturedImageUrl,
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
      {step === 'details' && (
        <button onClick={() => setStep('items')} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── STEP 1: Items ── */}
      {step === 'items' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">What&apos;s in this tote?</h1>
            <p className="text-gray-500 text-sm mt-1">Add one item per line. Be as specific as you like.</p>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={e => updateItem(item.id, e.target.value)}
                  placeholder={`Item ${idx + 1}`}
                  className="input-field flex-1"
                  autoFocus={idx === items.length - 1 && idx > 0}
                />
                {items.length > 1 && (
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>

          {/* Optional photo */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Optional: take a photo of the tote contents for reference</p>
            {capturedImageUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-200 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedImageUrl} alt="Tote contents" className="w-full h-36 object-cover" />
              </div>
            )}
            <button
              onClick={() => photoRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-blue rounded-2xl py-5 text-brand-blue font-semibold hover:bg-brand-blue/5 transition-colors"
            >
              <Camera className="w-6 h-6" />
              {capturedImageUrl ? 'Retake Photo' : 'Take Photo of Contents'}
            </button>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          </div>

          <button
            onClick={() => {
              if (items.filter(i => i.label.trim()).length === 0) {
                setError('Add at least one item.')
                return
              }
              setError(null)
              setStep('details')
            }}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── STEP 2: Tote Details ── */}
      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Name this tote</h1>
            <p className="text-gray-500 text-sm mt-1">Give it a nickname and optionally link it to a tote barcode.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tote Nickname</label>
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

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tote Barcode / ID <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeValue}
                onChange={e => setBarcodeValue(e.target.value.toUpperCase())}
                placeholder="TV-0001  or  leave blank"
                className="input-field flex-1"
              />
              <button
                onClick={() => barcodeRef.current?.click()}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-600 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors"
              >
                <QrCode className="w-4 h-4" /> Scan
              </button>
            </div>
            <input ref={barcodeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBarcodePhoto} />
            {barcodeValue && (
              <p className="text-xs text-green-600 font-semibold mt-1">✓ Tote ID: {barcodeValue}</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Items</span>
              <span className="font-semibold text-brand-navy">{items.filter(i => i.label.trim()).length} item{items.filter(i => i.label.trim()).length !== 1 ? 's' : ''}</span>
            </div>
            {toteName && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tote name</span>
                <span className="font-semibold text-brand-navy">{toteName}</span>
              </div>
            )}
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Tote
          </button>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-brand-navy mb-2">Tote Saved!</h2>
          <p className="text-gray-500 text-sm mb-6">
            &ldquo;{toteName}&rdquo; has been added to your account.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setStep('items')
                setItems([{ id: crypto.randomUUID(), label: '', ai_generated: false }])
                setToteName('')
                setBarcodeValue('')
                setCapturedImageUrl(null)
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
