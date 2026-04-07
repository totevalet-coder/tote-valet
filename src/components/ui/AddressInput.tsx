'use client'

import { useEffect, useRef, useCallback } from 'react'
import { MapPin } from 'lucide-react'

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

// Tracks whether the script has been injected
let scriptLoaded = false
let scriptLoading = false
const onLoadCallbacks: (() => void)[] = []

function loadGoogleMapsScript(apiKey: string, onLoad: () => void) {
  if (scriptLoaded) { onLoad(); return }
  onLoadCallbacks.push(onLoad)
  if (scriptLoading) return
  scriptLoading = true

  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
  script.async = true
  script.onload = () => {
    scriptLoaded = true
    onLoadCallbacks.forEach(cb => cb())
    onLoadCallbacks.length = 0
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || !window.google?.maps?.places) return
    if (autocompleteRef.current) return // already initialized

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address'],
      types: ['address'],
    })

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (place?.formatted_address) {
        onChange(place.formatted_address)
      }
    })
  }, [onChange])

  useEffect(() => {
    if (!apiKey) return
    loadGoogleMapsScript(apiKey, initAutocomplete)
    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
  }, [apiKey, initAutocomplete])

  // If no API key, render plain input
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

  return (
    <div className="relative">
      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className ?? 'input-field'} pl-9`}
        autoComplete="off"
      />
    </div>
  )
}
