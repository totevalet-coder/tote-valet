'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
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
  placeholder = '123 Main St, City, State',
  className,
  disabled,
}: AddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [mapsReady, setMapsReady] = useState<MapsState>(mapsState)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!apiKey) { setMapsReady('failed'); return }

    if (mapsState === 'ready') { setMapsReady('ready'); return }
    if (mapsState === 'failed') { setMapsReady('failed'); return }

    // Still loading — register callback and kick off load
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
  }, [mapsReady, onChange])

  // Plain text fallback (no API key, or Maps failed to load)
  if (!apiKey || mapsReady === 'failed') {
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

  // When Maps is ready, use an uncontrolled input so autocomplete can
  // manage the field value — we update React state only on place_changed
  return (
    <div className="relative">
      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className ?? 'input-field'} pl-9`}
        autoComplete="off"
      />
    </div>
  )
}
