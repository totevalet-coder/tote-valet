'use client'

import { ChevronLeft } from 'lucide-react'

interface BackButtonProps {
  onClick: () => void
  label?: string
}

// Shared back-navigation button — the exact same className was hand-copied
// across ~8 places in the customer portal (Add Items, Edit Totes, My Items,
// Billing, Profile, Request Totes). Consolidated so it can't drift.
export default function BackButton({ onClick, label = 'Back' }: BackButtonProps) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-brand-navy font-semibold text-sm">
      <ChevronLeft className="w-5 h-5" /> {label}
    </button>
  )
}
