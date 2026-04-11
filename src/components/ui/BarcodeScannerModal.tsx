'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onDetected: (value: string) => void
  onClose: () => void
  hint?: string
}

const SCANNER_DIV_ID = 'tv-barcode-scanner'

export default function BarcodeScannerModal({ onDetected, onClose, hint }: Props) {
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const detectedRef = useRef(false)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const scanner = new Html5Qrcode(SCANNER_DIV_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 110 },
            aspectRatio: 1.7778,
          },
          (decodedText) => {
            if (cancelled || detectedRef.current) return
            detectedRef.current = true
            scanner.stop().catch(() => {}).finally(() => {
              onDetected(decodedText.trim().toUpperCase())
            })
          },
          () => { /* ignore per-frame no-result errors */ }
        )

        if (!cancelled) setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message.toLowerCase() : ''
        if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')) {
          setErrorMsg('Camera permission denied. Allow camera access in your browser settings and try again.')
        } else if (msg.includes('notfound') || msg.includes('no camera')) {
          setErrorMsg('No camera found on this device.')
        } else {
          setErrorMsg('Could not start camera. Try entering the tote ID manually.')
        }
        setStatus('error')
      }
    }

    startScanner()

    return () => {
      cancelled = true
      scannerRef.current?.stop().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    scannerRef.current?.stop().catch(() => {})
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0">
        <h2 className="text-white font-bold text-lg">Scan Tote Barcode</h2>
        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">

        {/* html5-qrcode mounts video here */}
        <div
          id={SCANNER_DIV_ID}
          className="w-full"
          style={{ maxHeight: '60vh' }}
        />

        {/* Corner-bracket overlay — sits on top of the video */}
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-72 h-28">
              {/* Top-left */}
              <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-brand-blue rounded-tl-sm" />
              {/* Top-right */}
              <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-brand-blue rounded-tr-sm" />
              {/* Bottom-left */}
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-brand-blue rounded-bl-sm" />
              {/* Bottom-right */}
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-brand-blue rounded-br-sm" />
              {/* Scan line animation */}
              <div className="absolute inset-x-2 top-1/2 h-0.5 bg-brand-blue/70 animate-pulse" />
            </div>
          </div>
        )}

        {/* Starting spinner */}
        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            <p className="text-white/70 text-sm font-medium">Starting camera…</p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-4">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-2xl">📷</div>
            <p className="text-white text-sm text-center leading-relaxed">{errorMsg}</p>
            <button
              onClick={handleClose}
              className="mt-2 px-6 py-3 bg-white/15 text-white rounded-xl font-semibold text-sm"
            >
              Enter ID Manually
            </button>
          </div>
        )}
      </div>

      {/* Footer instructions */}
      {status === 'scanning' && (
        <div className="flex-shrink-0 px-5 pt-4 pb-10 text-center space-y-3">
          <p className="text-white/80 text-sm font-medium">
            {hint ?? 'Point the camera at the barcode on your tote'}
          </p>
          <button
            onClick={handleClose}
            className="text-white/50 text-xs underline underline-offset-2"
          >
            Enter ID manually instead
          </button>
        </div>
      )}

    </div>
  )
}
