'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'

// ─── Inner component (needs useSearchParams) ─────────────────────────────────
function ScanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return') ?? '/add-items'

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

  const handleClose = useCallback(() => {
    stopAll()
    router.back()
  }, [stopAll, router])

  const startDetecting = useCallback(() => {
    if (cancelledRef.current || scanStartedRef.current) return
    scanStartedRef.current = true
    setStatus('scanning')

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
            const value = results[0].rawValue.trim().toUpperCase()
            sessionStorage.setItem('scannedBarcode', value)
            router.push(returnTo)
          } else {
            rafRef.current = requestAnimationFrame(tick)
          }
        }).catch(() => { rafRef.current = requestAnimationFrame(tick) })
      }
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    // Fallback: canvas → html5-qrcode
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const scanFrame = () => {
        if (cancelledRef.current || detectedRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!canvas || !video || video.readyState < 2 || video.videoWidth === 0) {
          setTimeout(() => { if (!cancelledRef.current) rafRef.current = requestAnimationFrame(scanFrame) }, 300)
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
              const value = result.trim().toUpperCase()
              sessionStorage.setItem('scannedBarcode', value)
              router.push(returnTo)
            }
          } catch {
            setTimeout(() => { if (!cancelledRef.current) rafRef.current = requestAnimationFrame(scanFrame) }, 300)
          }
        }, 'image/jpeg', 0.85)
      }
      rafRef.current = requestAnimationFrame(scanFrame)
    })
  }, [stopAll, router, returnTo])

  useEffect(() => {
    cancelledRef.current = false
    scanStartedRef.current = false

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    }).then(stream => {
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      video.play().catch(() => {})

      const onReady = () => { clearTimeout(fallback); startDetecting() }
      video.addEventListener('canplay', onReady, { once: true })
      video.addEventListener('playing', onReady, { once: true })

      // Hard fallback after 3 s
      const fallback = setTimeout(() => startDetecting(), 3000)
    }).catch(err => {
      if (cancelledRef.current) return
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
      setErrorMsg(
        msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')
          ? 'Camera permission denied. Allow camera access in your browser settings.'
          : `Camera error: ${err instanceof Error ? err.message : String(err)}`
      )
      setStatus('error')
    })

    return () => { cancelledRef.current = true; stopAll() }
  }, [startDetecting, stopAll])

  return (
    /*
     * KEY LAYOUT RULE — fixes Android Chrome black video:
     * The <video> element must NOT be inside a position:fixed or transform ancestor.
     * Use position:relative + overflow:hidden on the wrapper instead.
     * Overlays use position:absolute (relative to this wrapper).
     */
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100dvh',
      overflow: 'hidden',
      background: '#000',
    }}>
      {/* Camera feed — plain block, no special positioning */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header overlay */}
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

      {/* Scanning reticle */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: 280, height: 110 }}>
            {[
              { top: 0, left: 0, borderTop: '3px solid #00A0DF', borderLeft: '3px solid #00A0DF' },
              { top: 0, right: 0, borderTop: '3px solid #00A0DF', borderRight: '3px solid #00A0DF' },
              { bottom: 0, left: 0, borderBottom: '3px solid #00A0DF', borderLeft: '3px solid #00A0DF' },
              { bottom: 0, right: 0, borderBottom: '3px solid #00A0DF', borderRight: '3px solid #00A0DF' },
            ].map((s, i) => (
              <span key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
            ))}
            <div style={{ position: 'absolute', left: 8, right: 8, top: '50%', height: 1, background: 'rgba(0,160,223,0.7)' }} />
          </div>
        </div>
      )}

      {/* Starting spinner */}
      {status === 'starting' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>Starting camera…</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 32px', gap: 20,
        }}>
          <span style={{ fontSize: 48 }}>📷</span>
          <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
          <button onClick={handleClose} style={{
            padding: '12px 24px', background: 'rgba(255,255,255,0.15)',
            color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            Enter ID Manually
          </button>
        </div>
      )}

      {/* Footer hint */}
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
            color: 'rgba(255,255,255,0.4)', fontSize: 12,
            background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
          }}>
            Enter ID manually instead
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Page wrapper with Suspense (required for useSearchParams) ────────────────
export default function ScanPage() {
  return (
    <Suspense fallback={
      <div style={{ width: '100%', height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  )
}
