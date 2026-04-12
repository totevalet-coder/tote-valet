'use client'

/**
 * BarcodeScanInput — shared scan widget used across driver, warehouse, sorter, admin.
 *
 * Primary:   Camera button → take photo → decode barcode via BarcodeDetector / html5-qrcode
 * Secondary: Plain text input for manual entry
 *
 * Calls props.onScan(value) with a trimmed, uppercased result from either method.
 * Page-level validation errors (wrong tote, not on manifest, etc.) live in each page —
 * this component only surfaces photo-decode errors internally.
 */

import { useRef, useState } from 'react'
import { Camera, ScanLine, Loader2 } from 'lucide-react'

interface Props {
  onScan: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function BarcodeScanInput({ onScan, placeholder = 'Enter ID manually', disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [manualValue, setManualValue] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState('')

  // ── Photo capture → decode ─────────────────────────────────────────────────
  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setDecoding(true)
    setDecodeError('')

    try {
      // Native BarcodeDetector (Chrome Android, Safari 17+)
      if ('BarcodeDetector' in window) {
        const detector = new (window as Window & {
          BarcodeDetector: new (opts: object) => {
            detect: (img: HTMLImageElement) => Promise<Array<{ rawValue: string }>>
          }
        }).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
        })
        const img = new Image()
        img.src = URL.createObjectURL(file)
        await new Promise<void>(r => { img.onload = () => r() })
        const results = await detector.detect(img)
        if (results.length > 0) {
          onScan(results[0].rawValue.trim().toUpperCase())
          return
        }
      }

      // Fallback: html5-qrcode file decoder
      const { Html5Qrcode } = await import('html5-qrcode')
      const result = await Html5Qrcode.scanFile(file, false)
      onScan(result.trim().toUpperCase())
    } catch {
      setDecodeError('Could not read barcode from photo. Enter the ID manually below.')
    } finally {
      setDecoding(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Manual entry ───────────────────────────────────────────────────────────
  function handleManual(e: React.FormEvent) {
    e.preventDefault()
    const val = manualValue.trim().toUpperCase()
    if (!val) return
    setManualValue('')
    setDecodeError('')
    onScan(val)
  }

  const busy = disabled || decoding

  return (
    <div className="space-y-3">
      {/* Primary — camera */}
      <button
        type="button"
        onClick={() => { setDecodeError(''); fileRef.current?.click() }}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-brand-blue rounded-2xl py-4 text-brand-blue font-semibold hover:bg-brand-blue/5 active:bg-brand-blue/10 transition-colors disabled:opacity-50"
      >
        {decoding
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : <Camera className="w-5 h-5" />}
        {decoding ? 'Reading barcode…' : 'Scan Barcode (Take Photo)'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />

      {decodeError && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {decodeError}
        </p>
      )}

      {/* Secondary — manual */}
      <form onSubmit={handleManual} className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={manualValue}
            onChange={e => { setManualValue(e.target.value); setDecodeError('') }}
            placeholder={placeholder}
            className="input-field pl-9 text-sm"
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !manualValue.trim()}
          className="bg-brand-navy text-white rounded-xl px-4 font-semibold text-sm disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  )
}
