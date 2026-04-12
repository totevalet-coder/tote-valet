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

    const t = setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const scanner = new Html5Qrcode(READER_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },
          (decoded: string) => {
            if (cancelled || detectedRef.current) return
            detectedRef.current = true
            scanner.stop().catch(() => {}).finally(() => {
              if (!cancelled) onDetected(decoded.trim().toUpperCase())
            })
          },
          () => {},
        )

        if (!cancelled) setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')) {
          setErrorMsg('Camera permission denied. Allow camera access in your browser settings.')
        } else {
          setErrorMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
        }
        setStatus('error')
      }
    }, 200)

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: '#000', display: 'flex', flexDirection: 'column',
    }}>

      {/* Header — absolute so it doesn't affect reader sizing */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '48px 20px 16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
      }}>
        <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: 0 }}>
          Scan Tote Barcode
        </h2>
        <button onClick={handleClose} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <X style={{ color: '#fff', width: 20, height: 20 }} />
        </button>
      </div>

      {/* Reader — full viewport, no constraints */}
      <div
        id={READER_ID}
        style={{ width: '100%', height: '100%', background: '#000' }}
      />

      {/* Footer — absolute so it doesn't affect reader sizing */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          padding: '16px 20px 48px', textAlign: 'center',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
        }}>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '0 0 8px' }}>
            {hint ?? 'Point the camera at the barcode on your tote'}
          </p>
          <button onClick={handleClose} style={{
            color: 'rgba(255,255,255,0.4)', fontSize: 12,
            background: 'none', border: 'none', cursor: 'pointer',
            textDecoration: 'underline',
          }}>
            Enter ID manually instead
          </button>
        </div>
      )}

      {/* Starting spinner */}
      {status === 'starting' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
            Starting camera…
          </p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 32px', gap: 20,
        }}>
          <div style={{ fontSize: 48 }}>📷</div>
          <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            {errorMsg}
          </p>
          <button onClick={handleClose} style={{
            padding: '12px 24px', background: 'rgba(255,255,255,0.15)',
            color: '#fff', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            Enter ID Manually
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
