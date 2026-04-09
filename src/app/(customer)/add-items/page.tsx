'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Camera,
  Pencil,
  QrCode,
  Plus,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  X,
} from 'lucide-react'
import type { ToteItem } from '@/types/database'

type WorkflowStep = 'choose' | 'manual' | 'photo' | 'scan' | 'nickname' | 'review' | 'done'
type InputMethod = 'photo' | 'manual'

interface DetectedItem extends ToteItem {
  id: string
}

export default function AddItemsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<WorkflowStep>('choose')
  const [inputMethod, setInputMethod] = useState<InputMethod>('manual')
  const [manualText, setManualText] = useState('')
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([])
  const [barcodeValue, setBarcodeValue] = useState('')
  const [toteName, setToteName] = useState('')
  const [isNewTote, setIsNewTote] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const [scannerActive, setScannerActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const scannerDivId = 'qr-reader'

  // Start the barcode scanner
  async function startScanner() {
    setScannerActive(true)
    // Small delay to allow the div to render
    await new Promise(r => setTimeout(r, 200))
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(scannerDivId)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          setBarcodeValue(decodedText.toUpperCase())
          stopScanner()
        },
        () => { /* ignore scan errors */ }
      )
    } catch {
      setScannerActive(false)
      setError('Could not access camera. Enter the tote ID manually below.')
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch { /* ignore */ }
      scannerRef.current = null
    }
    setScannerActive(false)
  }

  // Stop scanner when leaving scan step
  useEffect(() => {
    if (step !== 'scan') stopScanner()
  }, [step])

  // Convert manual text to items list
  function parseManualItems(): DetectedItem[] {
    return manualText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(label => ({
        id: crypto.randomUUID(),
        label,
        ai_generated: false,
      }))
  }

  // Handle photo capture — saves photo for reference, prompts manual entry
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setCapturedImageUrl(url)
    setStep('review')
  }

  function updateItemLabel(id: string, newLabel: string) {
    setDetectedItems(prev =>
      prev.map(item => (item.id === id ? { ...item, label: newLabel, ai_generated: false } : item))
    )
  }

  function removeItem(id: string) {
    setDetectedItems(prev => prev.filter(item => item.id !== id))
  }

  function addBlankItem() {
    setDetectedItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), label: '', ai_generated: false },
    ])
  }

  async function handleSave() {
    const items: ToteItem[] = (
      inputMethod === 'manual' ? parseManualItems() : detectedItems
    ).map(({ label, ai_generated }) => ({ label, ai_generated }))

    if (items.length === 0 || items.every(i => !i.label.trim())) {
      setError('Please add at least one item.')
      return
    }

    if (!toteName.trim()) {
      setError('Please name this tote.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_id', userData.user.id)
        .single()

      if (!customer) throw new Error('Customer record not found')

      // Determine tote ID: use scanned barcode if provided, otherwise generate one
      const toteId = barcodeValue.trim() || `TV-${Math.floor(1000 + Math.random() * 9000)}`

      // Check if tote already exists in DB
      const { data: existingTote } = await supabase
        .from('totes')
        .select('id, items')
        .eq('id', toteId)
        .single()

      if (existingTote) {
        // Tote exists — merge items in
        const mergedItems = [...(existingTote.items as ToteItem[]), ...items.filter(i => i.label.trim())]
        const { error: updateError } = await supabase
          .from('totes')
          .update({ items: mergedItems, tote_name: toteName, last_scan_date: new Date().toISOString() })
          .eq('id', existingTote.id)
        if (updateError) throw updateError
      } else {
        // New tote — create it
        const { error: insertError } = await supabase.from('totes').insert({
          id: toteId,
          customer_id: customer.id,
          tote_name: toteName,
          seal_number: null,
          photo_url: capturedImageUrl,
          status: 'empty_at_customer',
          bin_location: null,
          last_scan_date: new Date().toISOString(),
          items: items.filter(i => i.label.trim()),
        })
        if (insertError) throw insertError
      }

      setStep('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* Back / breadcrumb */}
      {step !== 'choose' && step !== 'done' && (
        <button
          onClick={() => {
            if (step === 'manual' || step === 'photo') setStep('choose')
            else if (step === 'scan') setStep('choose')
            else if (step === 'nickname') setStep('scan')
            else if (step === 'review') setStep(inputMethod === 'photo' ? 'photo' : 'manual')
          }}
          className="flex items-center gap-1 text-brand-navy font-semibold text-sm"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Step: Choose method */}
      {step === 'choose' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Add Items to Tote</h1>
            <p className="text-gray-500 text-sm mt-1">How would you like to add your items?</p>
          </div>

          <button
            onClick={() => { setInputMethod('photo'); setStep('photo') }}
            className="w-full card flex items-center gap-4 hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 bg-brand-navy rounded-2xl flex items-center justify-center flex-shrink-0">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-brand-navy">Take Photos of Items</p>
              <p className="text-xs text-gray-400 mt-0.5">AI will detect and label your items</p>
            </div>
            <Sparkles className="w-5 h-5 text-brand-blue ml-auto" />
          </button>

          <button
            onClick={() => { setInputMethod('manual'); setStep('manual') }}
            className="w-full card flex items-center gap-4 hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 bg-brand-blue rounded-2xl flex items-center justify-center flex-shrink-0">
              <Pencil className="w-7 h-7 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-brand-navy">Enter Items Manually</p>
              <p className="text-xs text-gray-400 mt-0.5">Type your item list</p>
            </div>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-50 px-3 text-xs text-gray-400">then</span>
            </div>
          </div>

          <button
            onClick={() => setStep('scan')}
            className="w-full card flex items-center gap-4 border-2 border-dashed border-gray-200 hover:border-brand-blue hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <QrCode className="w-7 h-7 text-gray-500" />
            </div>
            <div className="text-left">
              <p className="font-bold text-brand-navy">Scan Tote Barcode</p>
              <p className="text-xs text-gray-400 mt-0.5">Link items to a specific tote</p>
            </div>
          </button>
        </div>
      )}

      {/* Step: Manual entry */}
      {step === 'manual' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Enter Items</h1>
            <p className="text-gray-500 text-sm mt-1">Type one item per line</p>
          </div>

          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={"Winter jacket\nBlack boots\nChristmas decorations\nSki gear..."}
            rows={10}
            className="input-field resize-none font-mono text-sm"
          />

          <button
            onClick={() => {
              const items = parseManualItems()
              if (items.length === 0) {
                setError('Please enter at least one item.')
                return
              }
              setDetectedItems(items)
              setStep('scan')
            }}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Photo capture */}
      {step === 'photo' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Take a Photo</h1>
            <p className="text-gray-500 text-sm mt-1">
              AI will automatically detect and label your items
            </p>
          </div>

          <>
            {capturedImageUrl && (
              <div className="rounded-2xl overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedImageUrl} alt="Captured" className="w-full h-48 object-cover" />
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-brand-blue rounded-2xl py-10 hover:bg-brand-blue/5 transition-colors"
            >
              <Camera className="w-10 h-10 text-brand-blue" />
              <p className="text-brand-navy font-semibold">
                {capturedImageUrl ? 'Take Another Photo' : 'Open Camera'}
              </p>
              <p className="text-gray-400 text-xs">Tap to open camera or upload image</p>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />

            {capturedImageUrl && (
              <button
                onClick={() => setStep('scan')}
                className="btn-primary w-full"
              >
                Continue to Scan Tote
              </button>
            )}
          </>
        </div>
      )}

      {/* Step: Scan barcode */}
      {step === 'scan' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Scan Tote Barcode</h1>
            <p className="text-gray-500 text-sm mt-1">
              Point your camera at the barcode sticker on your tote
            </p>
          </div>

          {/* Live scanner view */}
          {scannerActive ? (
            <div className="relative rounded-2xl overflow-hidden border-2 border-brand-blue">
              <div id={scannerDivId} className="w-full" />
              <button
                onClick={stopScanner}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={startScanner}
              className="w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-brand-blue rounded-2xl py-10 hover:bg-brand-blue/5 transition-colors"
            >
              <QrCode className="w-10 h-10 text-brand-blue" />
              <p className="text-brand-navy font-semibold">Tap to Scan Barcode</p>
              <p className="text-gray-400 text-xs">Uses your phone camera</p>
            </button>
          )}

          {barcodeValue && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-semibold text-green-700">
              ✓ Scanned: {barcodeValue}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Or enter Tote ID manually
            </label>
            <input
              type="text"
              value={barcodeValue}
              onChange={e => setBarcodeValue(e.target.value.toUpperCase())}
              placeholder="TV-0001"
              className="input-field"
            />
          </div>

          <button
            onClick={() => {
              setIsNewTote(!barcodeValue.trim())
              setStep('nickname')
            }}
            className="btn-primary w-full"
          >
            {barcodeValue ? 'Link to This Tote' : 'Create New Tote'}
          </button>
        </div>
      )}

      {/* Step: Nickname */}
      {step === 'nickname' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">
              {isNewTote ? 'Name Your Tote' : 'Confirm Tote'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {isNewTote
                ? 'Give this tote a nickname so you can find it easily'
                : `Adding items to tote ${barcodeValue}`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tote Nickname
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
                <button
                  key={s}
                  onClick={() => setToteName(s)}
                  className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full hover:bg-brand-blue/10 hover:text-brand-blue transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (!toteName.trim()) {
                setError('Please give this tote a name.')
                return
              }
              setStep('review')
            }}
            className="btn-primary w-full"
          >
            Continue to Review
          </button>
        </div>
      )}

      {/* Step: Review items */}
      {step === 'review' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black text-brand-navy">Review Items</h1>
            <p className="text-gray-500 text-sm mt-1">
              Edit or remove any labels before saving
            </p>
          </div>

          <div className="space-y-2">
            {(inputMethod === 'manual' ? parseManualItems() : detectedItems).length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">No items yet. Add some below.</p>
            )}
            {(inputMethod === 'manual' ? parseManualItems() : detectedItems).map((item) => (
              <div key={item.id} className="flex items-center gap-3 card py-3">
                {item.ai_generated && (
                  <Sparkles className="w-4 h-4 text-brand-blue flex-shrink-0" />
                )}
                {inputMethod === 'manual' ? (
                  <span className="flex-1 text-sm text-gray-700">{item.label}</span>
                ) : (
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateItemLabel(item.id, e.target.value)}
                    className="flex-1 text-sm border-0 outline-none bg-transparent text-gray-700"
                  />
                )}
                {inputMethod === 'photo' && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {inputMethod === 'photo' && (
            <button
              onClick={addBlankItem}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          )}

          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Tote name</span>
              <span className="font-semibold text-brand-navy">{toteName}</span>
            </div>
            {barcodeValue && (
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">Tote ID</span>
                <span className="font-semibold text-brand-navy">{barcodeValue}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Tote & Items
          </button>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-brand-navy mb-2">Tote Saved!</h2>
          <p className="text-gray-500 text-sm mb-6">
            &ldquo;{toteName}&rdquo; has been saved to your account.
            Schedule a pickup when ready.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setStep('choose')
                setManualText('')
                setDetectedItems([])
                setBarcodeValue('')
                setToteName('')
                setCapturedImageUrl(null)
                setIsNewTote(true)
                setError(null)
              }}
              className="btn-secondary w-full"
            >
              Add Another Tote
            </button>
            <button
              onClick={() => { router.push('/dashboard'); router.refresh() }}
              className="btn-outline w-full"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
