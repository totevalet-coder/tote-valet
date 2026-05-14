'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, AlertCircle } from 'lucide-react'

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  onVerified?: (verified: boolean) => void  // called true when place selected, false when manually edited
  placeholder?: string
  className?: string
  disabled?: boolean
}

type MapsState = 'loading' | 'ready' | 'failed'

let mapsState: MapsState = 'loading'
const mapsCallbacks: Array<(state: MapsState) => void> = []

function loadGoogleMapsScript(apiKey: string) {
  if (mapsState !== 'loading') return

  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
  script.async = true
  script.onload = () => {
    mapsState = 'ready'
    mapsCallbacks.forEach(cb => cb('ready'))
    mapsCallbacks.length = 0
  }
  script.onerror = () => {
    mapsState = 'failed'
    mapsCallbacks.forEach(cb => cb('failed'))
    mapsCallbacks.length = 0
  }
  document.head.appendChild(script)
}

export default function AddressInput({
  value,
  onChange,
  onVerified,
  placeholder = '123 Main St, City, State',
  className,
  disabled,
}: AddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [mapsReady, setMapsReady] = useState<MapsState>(mapsState)
  const [verified, setVerified] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!apiKey) { setMapsReady('failed'); return }
    if (mapsState === 'ready') { setMapsReady('ready'); return }
    if (mapsState === 'failed') { setMapsReady('failed'); return }
    mapsCallbacks.push(setMapsReady)
    loadGoogleMapsScript(apiKey)
  }, [apiKey])

  // Init autocomplete once Maps is ready
  useEffect(() => {
    if (mapsReady !== 'ready' || !inputRef.current || autocompleteRef.current) return

    try {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address'],
        types: ['address'],
      })
      autocompleteRef.current = ac

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.formatted_address) {
          onChange(place.formatted_address)
          setVerified(true)
          onVerified?.(true)
        }
      })
    } catch {
      setMapsReady('failed')
    }

    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
  }, [mapsReady, onChange, onVerified])

  function handleManualChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    // Mark unverified when user edits manually
    if (verified) {
      setVerified(false)
      onVerified?.(false)
    }
  }

  // No API key — plain input, no verification required
  if (!apiKey) {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className ?? 'input-field'}
      />
    )
  }

  // Maps failed — plain input with warning
  if (mapsReady === 'failed') {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className ?? 'input-field'}
      />
    )
  }

  // Maps active — uncontrolled input with autocomplete
  const showUnverifiedHint = value.length > 5 && !verified

  return (
    <div className="space-y-1">
      <div className="relative">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          defaultValue={value}
          onChange={handleManualChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className ?? 'input-field'} pl-9 ${showUnverifiedHint ? 'border-amber-400 focus:ring-amber-400' : ''}`}
          autoComplete="off"
        />
      </div>
      {showUnverifiedHint && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Please select an address from the dropdown suggestions
        </p>
      )}
    </div>
  )
}
