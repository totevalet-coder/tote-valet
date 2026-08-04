'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, ScanLine, X, Zap, Aperture } from 'lucide-react'
import type { BrowserMultiFormatReader } from '@zxing/browser'

interface Props {
  onScan: (value: string) => void
  placeholder?: string
  disabled?: boolean
  large?: boolean
}

// The native Shape Detection API (BarcodeDetector) isn't in TypeScript's bundled
// DOM lib. Typed loosely and privately here instead of touching global types —
// avoids any risk of colliding with whatever TS ships in the future.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike

// Broad format list — covers common 1D retail/logistics barcodes (tote labels)
// plus QR/DataMatrix in case those ever get used. Cheap to over-include.
const BARCODE_FORMATS = [
  'code_128', 'code_39', 'code_93', 'codabar',
  'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e',
  'qr_code', 'data_matrix',
]

function getNativeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

export default function BarcodeScanInput({ onScan, placeholder = 'Enter ID manually', disabled, large }: Props) {
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [captureError, setCaptureError] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  // Whichever decode engine ended up active for this scan session — used by
  // both the live loop and the "take photo instead" fallback so they agree.
  const engineRef = useRef<
    | { type: 'native'; detector: BarcodeDetectorLike }
    | { type: 'zxing'; reader: BrowserMultiFormatReader }
    | null
  >(null)
  const stopEngineRef = useRef<(() => void) | null>(null)
  const detectedRef = useRef(false)

  const stopScanning = useCallback(() => {
    try { stopEngineRef.current?.() } catch { /* ignore */ }
    stopEngineRef.current = null
    engineRef.current = null
    trackRef.current = null
    detectedRef.current = false
    setTorchOn(false)
    setTorchSupported(false)
    setCaptureError('')
    setScanning(false)
  }, [])

  const finishWithResult = useCallback((text: string) => {
    if (detectedRef.current) return
    detectedRef.current = true
    if (navigator.vibrate) navigator.vibrate(80)
    stopScanning()
    onScan(text.trim().toUpperCase())
  }, [onScan, stopScanning])

  useEffect(() => {
    if (!scanning) return
    let active = true
    let stream: MediaStream | null = null
    let rafId: number | null = null

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (!active || !videoRef.current) { stream.getTracks().forEach(t => t.stop()); return }

        const track = stream.getVideoTracks()[0]
        trackRef.current = track ?? null

        if (track) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
          } catch { /* ignore */ }

          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
          if (caps.torch) setTorchSupported(true)
        }

        videoRef.current.srcObject = stream
        await videoRef.current.play()

        // Try the phone's native, hardware-accelerated scanner first — much
        // faster/more reliable than a JS decoder where it's available
        // (mainly Android Chrome; iOS Safari doesn't support it yet, and
        // will just fall through to the ZXing path below).
        const NativeDetector = getNativeDetectorCtor()
        if (NativeDetector) {
          try {
            const detector = new NativeDetector({ formats: BARCODE_FORMATS })
            // Probe it actually works before committing to this path.
            await detector.detect(videoRef.current)
            if (!active) return

            engineRef.current = { type: 'native', detector }
            stopEngineRef.current = () => { if (rafId !== null) cancelAnimationFrame(rafId) }

            const tick = async () => {
              if (!active || detectedRef.current) return
              try {
                const results = await detector.detect(videoRef.current!)
                if (results.length > 0) {
                  finishWithResult(results[0].rawValue)
                  return
                }
              } catch { /* transient per-frame errors are normal, keep going */ }
              rafId = requestAnimationFrame(tick)
            }
            rafId = requestAnimationFrame(tick)
            return
          } catch {
            // Native detector present but not actually functional (happens on
            // some desktop/older Chrome builds) — fall through to ZXing.
          }
        }

        if (!active) return

        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const { DecodeHintType } = await import('@zxing/library')

        const hints = new Map()
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)
        engineRef.current = { type: 'zxing', reader }

        const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (!active || !result) return
          finishWithResult(result.getText())
        })
        if (!active) { controls.stop(); return }
        stopEngineRef.current = () => controls.stop()
      } catch {
        if (!active) return
        setCameraError('Camera access denied. Enter the ID manually below.')
        setScanning(false)
      }
    }

    init()

    return () => {
      active = false
      if (rafId !== null) cancelAnimationFrame(rafId)
      try { stopEngineRef.current?.() } catch { /* ignore */ }
      stopEngineRef.current = null
      engineRef.current = null
      trackRef.current = null
      stream?.getTracks().forEach(t => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  async function toggleTorch() {
    if (!trackRef.current) return
    const next = !torchOn
    try {
      await trackRef.current.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch { /* ignore */ }
  }

  // "Take photo instead" — decodes one full-resolution still frame rather
  // than racing live video. Much more forgiving than the live loop: no
  // motion blur, no partial frames, user picks the moment.
  async function capturePhoto() {
    const video = videoRef.current
    const engine = engineRef.current
    if (!video || !engine || capturing) return

    setCapturing(true)
    setCaptureError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no-canvas-context')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      if (engine.type === 'native') {
        const results = await engine.detector.detect(canvas)
        if (results.length > 0) {
          finishWithResult(results[0].rawValue)
          return
        }
      } else {
        try {
          const result = engine.reader.decodeFromCanvas(canvas)
          finishWithResult(result.getText())
          return
        } catch {
          // decodeFromCanvas throws when nothing is found — fall through to the error message below.
        }
      }
      setCaptureError("Couldn't find a barcode in that photo — reposition and try again, or enter the ID manually below.")
    } catch {
      setCaptureError('Something went wrong capturing that photo. Try again, or enter the ID manually below.')
    } finally {
      setCapturing(false)
    }
  }

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

          {/* Viewfinder */}
          <div className="relative z-10 w-72 h-44">
            <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-white rounded-br-lg" />
            <div
              className="absolute inset-x-2 h-0.5 bg-brand-blue shadow-[0_0_6px_2px_rgba(0,160,223,0.6)]"
              style={{ animation: 'scan-line 1.6s ease-in-out infinite' }}
            />
          </div>

          <p className="relative z-10 text-white/80 text-sm mt-5 font-medium tracking-wide">
            Align barcode inside the box
          </p>

          {captureError && (
            <p className="relative z-10 text-red-300 text-sm text-center mt-3 px-8 max-w-sm">
              {captureError}
            </p>
          )}

          <div className="relative z-10 mt-5 flex items-center gap-3">
            {/* Torch toggle — only shown if device supports it */}
            {torchSupported && (
              <button
                onClick={toggleTorch}
                className={`flex items-center gap-2 px-5 py-3 rounded-full font-semibold transition-colors ${
                  torchOn
                    ? 'bg-yellow-400 text-black'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                {torchOn ? 'Light On' : 'Light'}
              </button>
            )}

            <button
              onClick={capturePhoto}
              disabled={capturing}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-5 py-3 rounded-full font-semibold transition-colors disabled:opacity-50"
            >
              <Aperture className="w-4 h-4" />
              {capturing ? 'Reading…' : 'Take Photo'}
            </button>

            <button
              onClick={stopScanning}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-7 py-3 rounded-full font-semibold transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
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
