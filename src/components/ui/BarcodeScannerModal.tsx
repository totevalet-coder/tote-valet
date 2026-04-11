'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

interface Props {
  onDetected: (value: string) => void
  onClose: () => void
  hint?: string
}

export default function BarcodeScannerModal({ onDetected, onClose, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectedRef = useRef(false)

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  // Stop camera + animation loop
  const stopAll = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        if (cancelled) { stopAll(); return }

        setStatus('scanning')

        // ── Strategy 1: native BarcodeDetector (Chrome / Android / Safari 17+) ──
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar'],
          })

          const tick = () => {
            if (cancelled || detectedRef.current) return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            detector.detect(video).then((results: Array<{ rawValue: string }>) => {
              if (!cancelled && !detectedRef.current && results.length > 0) {
                detectedRef.current = true
                stopAll()
                onDetected(results[0].rawValue.trim().toUpperCase())
              } else {
                rafRef.current = requestAnimationFrame(tick)
              }
            }).catch(() => { rafRef.current = requestAnimationFrame(tick) })
          }
          rafRef.current = requestAnimationFrame(tick)
          return
        }

        // ── Strategy 2: canvas frame → html5-qrcode file scan (fallback) ──
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const scanFrame = () => {
          if (cancelled || detectedRef.current) return
          const canvas = canvasRef.current
          if (!canvas || video.videoWidth === 0) {
            rafRef.current = requestAnimationFrame(scanFrame)
            return
          }
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')?.drawImage(video, 0, 0)

          canvas.toBlob(async blob => {
            if (!blob || cancelled || detectedRef.current) return
            try {
              const result = await Html5Qrcode.scanFile(new File([blob], 'f.jpg', { type: 'image/jpeg' }), false)
              if (!detectedRef.current && !cancelled) {
                detectedRef.current = true
                stopAll()
                onDetected(result.trim().toUpperCase())
              }
            } catch {
              // no barcode this frame — wait then try again
              setTimeout(() => { if (!cancelled) rafRef.current = requestAnimationFrame(scanFrame) }, 250)
            }
          }, 'image/jpeg', 0.8)
        }
        rafRef.current = requestAnimationFrame(scanFrame)

      } catch (err) {
        if (cancelled) return
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')) {
          setErrorMsg('Camera permission denied. Allow camera access in your browser settings and try again.')
        } else if (msg.includes('notfound') || msg.includes('devicenotfound') || msg.includes('no camera')) {
          setErrorMsg('No camera found on this device.')
        } else {
          setErrorMsg(`Camera error: ${err instanceof Error ? err.message : String(err)}`)
        }
        setStatus('error')
      }
    }

    start()
    return () => { cancelled = true; stopAll() }
  }, [onDetected, stopAll])

  function handleClose() { stopAll(); onClose() }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0">
        <h2 className="text-white font-bold text-lg">Scan Tote Barcode</h2>
        <button onClick={handleClose} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative overflow-hidden">

        {/* Live video feed — always rendered so ref is available */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Hidden canvas for frame capture fallback */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Corner-bracket scanning overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Dark vignette */}
            <div className="absolute inset-0 bg-black/30" />
            {/* Clear scanning window */}
            <div className="relative z-10 w-72 h-28 bg-transparent">
              {/* Cutout highlight */}
              <div className="absolute inset-0 border border-white/20 rounded-sm" />
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-brand-blue" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-brand-blue" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-brand-blue" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-brand-blue" />
              {/* Scan line */}
              <div className="absolute inset-x-3 top-1/2 h-px bg-brand-blue/80 animate-pulse" />
            </div>
          </div>
        )}

        {/* Starting */}
        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            <p className="text-white/70 text-sm font-medium">Starting camera…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-5">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">📷</div>
            <p className="text-white text-sm text-center leading-relaxed">{errorMsg}</p>
            <button onClick={handleClose} className="px-6 py-3 bg-white/15 text-white rounded-xl font-semibold text-sm border border-white/20">
              Enter ID Manually
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      {status === 'scanning' && (
        <div className="flex-shrink-0 px-5 pt-5 pb-12 text-center space-y-3">
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
