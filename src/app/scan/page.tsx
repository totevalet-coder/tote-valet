'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'

function ScanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return') ?? '/add-items'

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const detectedRef = useRef(false)
  const mountedRef = useRef(true)

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  const stopScanner = useCallback(() => {
    try { controlsRef.current?.stop() } catch { /* ignore */ }
    controlsRef.current = null
  }, [])

  const handleClose = useCallback(() => {
    mountedRef.current = false
    stopScanner()
    router.back()
  }, [stopScanner, router])

  useEffect(() => {
    mountedRef.current = true
    detectedRef.current = false

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()

        if (!videoRef.current || !mountedRef.current) return

        setStatus('scanning')

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, err) => {
            if (!mountedRef.current || detectedRef.current) return
            if (result) {
              detectedRef.current = true
              stopScanner()
              const value = result.getText().trim().toUpperCase()
              sessionStorage.setItem('scannedBarcode', value)
              router.push(returnTo)
            }
            // err fires on every frame with no barcode — normal, ignore it
            void err
          }
        )

        if (mountedRef.current) {
          controlsRef.current = controls
        } else {
          controls.stop()
        }
      } catch (err) {
        if (!mountedRef.current) return
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        setErrorMsg(
          msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')
            ? 'Camera permission denied. Allow camera access in your browser settings.'
            : `Camera error: ${err instanceof Error ? err.message : String(err)}`
        )
        setStatus('error')
      }
    }

    start()

    return () => {
      mountedRef.current = false
      stopScanner()
    }
  }, [stopScanner, router, returnTo])

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: '#000',
    }}>
      {/* ZXing attaches to and manages this video element */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
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

      {/* Error */}
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
