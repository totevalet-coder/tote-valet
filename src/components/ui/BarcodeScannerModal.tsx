'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onDetected: (value: string) => void
  onClose: () => void
  hint?: string
}

const READER_ID = 'tv-qr-reader'

export default function BarcodeScannerModal({ onDetected, onClose, hint }: Props) {
  const detectedRef = useRef(false)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false

    // Small delay to guarantee the reader div is in the DOM
    const t = setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const scanner = new Html5Qrcode(READER_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },           // bare minimum — no qrbox, no aspectRatio
          (decoded: string) => {
            if (cancelled || detectedRef.current) return
            detectedRef.current = true
            scanner.stop().catch(() => {}).finally(() => {
              if (!cancelled) onDetected(decoded.trim().toUpperCase())
            })
          },
          () => {},              // per-frame no-result — ignore
        )

        if (!cancelled) setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')) {
          setErrorMsg('Camera permission denied. Allow camera access in your browser settings.')
        } else {
          setErrorMsg(`Camera error: ${err instanceof Error ? err.message : String(err)}`)
        }
        setStatus('error')
      }
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(t)
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
      <div className="flex items-center justify-between px-5 pt-12 pb-3 flex-shrink-0">
        <h2 className="text-white font-bold text-lg">Scan Tote Barcode</h2>
        <button onClick={handleClose}
          className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* html5-qrcode mounts its own video inside this div */}
      <div
        id={READER_ID}
        className="flex-1 w-full overflow-hidden"
        style={{ background: '#000' }}
      />

      {/* Spinner overlaid while starting */}
      {status === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
          <p className="text-white/70 text-sm font-medium">Starting camera…</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-5">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">📷</div>
          <p className="text-white text-sm text-center leading-relaxed">{errorMsg}</p>
          <button onClick={handleClose}
            className="px-6 py-3 bg-white/15 text-white rounded-xl font-semibold text-sm border border-white/20">
            Enter ID Manually
          </button>
        </div>
      )}

      {/* Footer */}
      {status === 'scanning' && (
        <div className="flex-shrink-0 px-5 pt-4 pb-10 text-center space-y-3 bg-black">
          <p className="text-white/80 text-sm font-medium">
            {hint ?? 'Point the camera at the barcode on your tote'}
          </p>
          <button onClick={handleClose} className="text-white/40 text-xs underline underline-offset-2">
            Enter ID manually instead
          </button>
        </div>
      )}

    </div>
  )
}
