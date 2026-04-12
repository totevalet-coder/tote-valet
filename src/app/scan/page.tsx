'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'

function ScanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return') ?? '/add-items'

  const videoRef   = useRef<HTMLVideoElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const scanRef    = useRef<HTMLCanvasElement>(null)

  const streamRef    = useRef<MediaStream | null>(null)
  const drawRafRef   = useRef<number | null>(null)
  const scanRafRef   = useRef<number | null>(null)
  const detectedRef  = useRef(false)
  const cancelledRef = useRef(false)

  const [status, setStatus]    = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  const stopAll = useCallback(() => {
    cancelledRef.current = true
    if (drawRafRef.current) { cancelAnimationFrame(drawRafRef.current); drawRafRef.current = null }
    if (scanRafRef.current) { cancelAnimationFrame(scanRafRef.current); scanRafRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const handleClose = useCallback(() => { stopAll(); router.back() }, [stopAll, router])

  const onDetected = useCallback((raw: string) => {
    if (detectedRef.current || cancelledRef.current) return
    detectedRef.current = true
    stopAll()
    sessionStorage.setItem('scannedBarcode', raw.trim().toUpperCase())
    router.push(returnTo)
  }, [stopAll, router, returnTo])

  // ── scan loop ─────────────────────────────────────────────────────────────
  const startScanning = useCallback(() => {
    if (cancelledRef.current) return
    setStatus('scanning')

    if ('BarcodeDetector' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'],
      })
      const tick = () => {
        if (cancelledRef.current || detectedRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          scanRafRef.current = requestAnimationFrame(tick); return
        }
        detector.detect(video)
          .then((r: Array<{ rawValue: string }>) => {
            if (r.length > 0) onDetected(r[0].rawValue)
            else scanRafRef.current = requestAnimationFrame(tick)
          })
          .catch(() => { scanRafRef.current = requestAnimationFrame(tick) })
      }
      scanRafRef.current = requestAnimationFrame(tick)
      return
    }

    // canvas fallback
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const tick = () => {
        if (cancelledRef.current || detectedRef.current) return
        const c = scanRef.current
        if (!c || c.width === 0) { setTimeout(() => { if (!cancelledRef.current) tick() }, 300); return }
        c.toBlob(async blob => {
          if (!blob || cancelledRef.current || detectedRef.current) return
          try { onDetected(await Html5Qrcode.scanFile(new File([blob], 'f.jpg', { type: 'image/jpeg' }), false)) }
          catch { setTimeout(() => { if (!cancelledRef.current) tick() }, 300) }
        }, 'image/jpeg', 0.85)
      }
      tick()
    })
  }, [onDetected])

  // ── draw loop: video → canvas (runs every frame) ──────────────────────────
  const startDrawLoop = useCallback(() => {
    const draw = () => {
      if (cancelledRef.current) return
      const video = videoRef.current
      const disp  = displayRef.current
      const scan  = scanRef.current

      if (video) {
        // Update debug info every ~30 frames
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const w = video.videoWidth, h = video.videoHeight
          if (disp) { disp.width = w; disp.height = h; disp.getContext('2d')?.drawImage(video, 0, 0) }
          if (scan) { scan.width  = w; scan.height  = h; scan.getContext('2d')?.drawImage(video, 0, 0) }
        }
      }
      drawRafRef.current = requestAnimationFrame(draw)
    }
    drawRafRef.current = requestAnimationFrame(draw)
  }, [])

  // ── mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false
    detectedRef.current = false

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
      .then(stream => {
        if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        // Do NOT call play() here — let autoPlay handle it.
        // Calling play() on a non-user-gesture frame can silently fail on Android.

        startDrawLoop()

        const go = () => { clearTimeout(fb); startScanning() }
        video.addEventListener('canplay', go, { once: true })
        video.addEventListener('playing', go, { once: true })
        const fb = setTimeout(() => startScanning(), 4000)
      })
      .catch(err => {
        if (cancelledRef.current) return
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        setErrorMsg(
          msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')
            ? 'Camera permission denied. Allow camera access in your browser settings.'
            : `Camera error: ${err instanceof Error ? err.message : String(err)}`
        )
        setStatus('error')
      })

    return () => stopAll()
  }, [startDrawLoop, startScanning, stopAll])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>

      {/*
       * Video element: kept in render flow with opacity 0.01 (not display:none).
       * Android Chrome stops decoding frames for display:none video elements.
       * opacity:0.01 keeps the decode pipeline active but makes it invisible.
       */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: 0.01,
        }}
      />

      {/* Hidden scan canvas (html5-qrcode fallback) */}
      <canvas ref={scanRef} style={{ display: 'none' }} />

      {/* Visible display canvas — draws frames from video */}
      <canvas
        ref={displayRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
        }}
      />

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '48px 20px 20px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Scan Tote Barcode</span>
        <button onClick={handleClose} style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X style={{ color: '#fff', width: 20, height: 20 }} />
        </button>
      </div>

      {/* Starting spinner */}
      {status === 'starting' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>Starting camera…</p>
        </div>
      )}

      {/* Scanning reticle */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: 280, height: 110 }}>
            {[
              { top: 0,    left:  0, borderTop:    '3px solid #00A0DF', borderLeft:  '3px solid #00A0DF' },
              { top: 0,    right: 0, borderTop:    '3px solid #00A0DF', borderRight: '3px solid #00A0DF' },
              { bottom: 0, left:  0, borderBottom: '3px solid #00A0DF', borderLeft:  '3px solid #00A0DF' },
              { bottom: 0, right: 0, borderBottom: '3px solid #00A0DF', borderRight: '3px solid #00A0DF' },
            ].map((s, i) => (
              <span key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
            ))}
            <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 1, background: 'rgba(0,160,223,0.7)' }} />
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 32px', gap: 20,
        }}>
          <span style={{ fontSize: 48 }}>📷</span>
          <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
          <button onClick={handleClose} style={{
            padding: '12px 24px', background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Enter ID Manually</button>
        </div>
      )}

      {/* Footer */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
          padding: '16px 20px 48px', textAlign: 'center',
          background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)',
        }}>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '0 0 8px' }}>
            Point the camera at the barcode on your tote
          </p>
          <button onClick={handleClose} style={{
            color: 'rgba(255,255,255,0.4)', fontSize: 12, background: 'none',
            border: 'none', cursor: 'pointer', textDecoration: 'underline',
          }}>Enter ID manually instead</button>
        </div>
      )}


<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={
      <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  )
}
