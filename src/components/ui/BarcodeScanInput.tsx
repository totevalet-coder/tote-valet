'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, ScanLine, X } from 'lucide-react'

interface Props {
  onScan: (value: string) => void
  placeholder?: string
  disabled?: boolean
  large?: boolean
}

export default function BarcodeScanInput({ onScan, placeholder = 'Enter ID manually', disabled, large }: Props) {
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [manualValue, setManualValue] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<{ reset: () => void } | null>(null)

  const stopScanning = useCallback(() => {
    try { readerRef.current?.reset() } catch { /* ignore */ }
    readerRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => {
    if (!scanning) return
    let active = true

    async function init() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader as unknown as { reset: () => void }

        await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!active || !result) return
          if (navigator.vibrate) navigator.vibrate(80)
          stopScanning()
          onScan(result.getText().trim().toUpperCase())
        })
      } catch {
        if (!active) return
        setCameraError('Camera access denied. Enter the ID manually below.')
        setScanning(false)
      }
    }

    init()

    return () => {
      active = false
      try { readerRef.current?.reset() } catch { /* ignore */ }
      readerRef.current = null
    }
  }, [scanning, onScan, stopScanning])

  function handleManual(e: React.FormEvent) {
    e.preventDefault()
    const val = manualValue.trim().toUpperCase()
    if (!val) return
    setManualValue('')
    setCameraError('')
    onScan(val)
  }

  return (
    <>
      {/* Full-screen scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Dimmed surround */}
          <div className="absolute inset-0 bg-black/55 pointer-events-none" />

          {/* Viewfinder cutout */}
          <div className="relative z-10 w-72 h-44">
            {/* Corner marks */}
            <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-white rounded-br-lg" />

            {/* Animated scan line */}
            <div
              className="absolute inset-x-2 h-0.5 bg-brand-blue shadow-[0_0_6px_2px_rgba(0,160,223,0.6)]"
              style={{ animation: 'scan-line 1.6s ease-in-out infinite' }}
            />
          </div>

          <p className="relative z-10 text-white/80 text-sm mt-5 font-medium tracking-wide">
            Align barcode inside the box
          </p>

          <button
            onClick={stopScanning}
            className="relative z-10 mt-5 flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-7 py-3 rounded-full font-semibold transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      )}

      <div className="space-y-3">
        {/* Primary — live camera */}
        <button
          type="button"
          onClick={() => { setCameraError(''); setScanning(true) }}
          disabled={disabled}
          className={`w-full flex items-center justify-center gap-3 border-2 border-dashed border-brand-blue rounded-2xl text-brand-blue font-semibold hover:bg-brand-blue/5 active:bg-brand-blue/10 transition-colors disabled:opacity-50 ${large ? 'py-7 text-xl flex-col' : 'py-4'}`}
        >
          <Camera className={large ? 'w-9 h-9' : 'w-5 h-5'} />
          Scan Barcode
          {large && <span className="text-sm font-normal text-brand-blue/70">Tap to open camera</span>}
        </button>

        {cameraError && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {cameraError}
          </p>
        )}

        {/* Secondary — manual entry */}
        <form onSubmit={handleManual} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 ${large ? 'w-5 h-5' : 'w-4 h-4'}`} />
            <input
              type="text"
              value={manualValue}
              onChange={e => { setManualValue(e.target.value); setCameraError('') }}
              placeholder={placeholder}
              className={`input-field pl-9 ${large ? 'text-base py-4' : 'text-sm'}`}
              disabled={disabled}
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !manualValue.trim()}
            className={`bg-brand-navy text-white rounded-xl font-semibold disabled:opacity-40 ${large ? 'px-5 text-base' : 'px-4 text-sm'}`}
          >
            Add
          </button>
        </form>
      </div>
    </>
  )
}
