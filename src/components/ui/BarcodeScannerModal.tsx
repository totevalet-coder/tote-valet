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
  const cancelledRef = useRef(false)
  const scanStartedRef = useRef(false)

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  const stopAll = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // Detection loop — safe to call multiple times (guarded by scanStartedRef)
  const startDetecting = useCallback(() => {
    if (cancelledRef.current || scanStartedRef.current) return
    scanStartedRef.current = true
    setStatus('scanning')

    // ── BarcodeDetector (Chrome / Android / Safari 17+) ──
    if ('BarcodeDetector' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'],
      })
      const tick = () => {
        if (cancelledRef.current || detectedRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detector.detect(video).then((results: Array<{ rawValue: string }>) => {
          if (!cancelledRef.current && !detectedRef.current && results.length > 0) {
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

    // ── Canvas frame → html5-qrcode (fallback) ──
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const scanFrame = () => {
        if (cancelledRef.current || detectedRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!canvas || !video || video.readyState < 2 || video.videoWidth === 0) {
          setTimeout(() => { if (!cancelledRef.current) rafRef.current = requestAnimationFrame(scanFrame) }, 200)
          return
        }
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')?.drawImage(video, 0, 0)
        canvas.toBlob(async blob => {
          if (!blob || cancelledRef.current || detectedRef.current) return
          try {
            const result = await Html5Qrcode.scanFile(new File([blob], 'f.jpg', { type: 'image/jpeg' }), false)
            if (!detectedRef.current && !cancelledRef.current) {
              detectedRef.current = true
              stopAll()
              onDetected(result.trim().toUpperCase())
            }
          } catch {
            setTimeout(() => { if (!cancelledRef.current) rafRef.current = requestAnimationFrame(scanFrame) }, 300)
          }
        }, 'image/jpeg', 0.85)
      }
      rafRef.current = requestAnimationFrame(scanFrame)
    })
  }, [onDetected, stopAll])

  useEffect(() => {
    cancelledRef.current = false
    scanStartedRef.current = false

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      // Call play() explicitly — don't await it (avoids the 10s hang)
      // autoPlay prop also set as a belt-and-suspenders measure
      video.play().catch(() => {})

      // Fallback: if video events don't fire within 4s, start scanning anyway
      const fallback = setTimeout(() => {
        if (!cancelledRef.current) startDetecting()
      }, 4000)

      video.addEventListener('canplay', () => { clearTimeout(fallback); startDetecting() }, { once: true })
      video.addEventListener('playing', () => { clearTimeout(fallback); startDetecting() }, { once: true })
    }).catch(err => {
      if (cancelledRef.current) return
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
      if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')) {
        setErrorMsg('Camera permission denied. Allow camera access in your browser settings.')
      } else if (msg.includes('notfound') || msg.includes('devicenotfound')) {
        setErrorMsg('No camera found on this device.')
      } else {
        setErrorMsg(`Camera error: ${err instanceof Error ? err.message : String(err)}`)
      }
      setStatus('error')
    })

    return () => { cancelledRef.current = true; stopAll() }
  }, [startDetecting, stopAll])

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
      <div className="flex-1 relative bg-black" style={{ minHeight: 0 }}>

        {/* Video absolutely fills the container */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
          }}
        />

        {/* Hidden canvas for fallback frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Scanning overlay */}
        {status === 'scanning' && (
          <div style={{ position: 'absolute', inset: 0 }}
            className="flex items-center justify-center pointer-events-none">
            <div style={{ position: 'absolute', inset: 0 }} className="bg-black/30" />
            <div className="relative z-10 w-72 h-28">
              <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-brand-blue" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-brand-blue" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-brand-blue" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-brand-blue" />
              <div className="absolute inset-x-3 top-1/2 h-px bg-brand-blue/80 animate-pulse" />
            </div>
          </div>
        )}

        {/* Starting spinner */}
        {status === 'starting' && (
          <div style={{ position: 'absolute', inset: 0 }}
            className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            <p className="text-white/70 text-sm font-medium">Starting camera…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0 }}
            className="flex flex-col items-center justify-center px-8 gap-5">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">📷</div>
            <p className="text-white text-sm text-center leading-relaxed">{errorMsg}</p>
            <button onClick={handleClose}
              className="px-6 py-3 bg-white/15 text-white rounded-xl font-semibold text-sm border border-white/20">
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
