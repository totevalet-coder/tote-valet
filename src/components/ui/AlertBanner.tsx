'use client'

import type { ReactNode } from 'react'

interface AlertBannerProps {
  variant?: 'error' | 'success' | 'warning'
  children: ReactNode
  className?: string // append layout modifiers (e.g. "flex items-center gap-2") without losing the base look
}

const VARIANT_CLASSES = {
  error: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
}

// Shared inline alert — the exact same className was hand-copied across the
// customer portal (Add Items, Edit Totes, My Items, Profile, Request Totes)
// for error messages, plus a couple of success confirmations.
export default function AlertBanner({ variant = 'error', children, className = '' }: AlertBannerProps) {
  return (
    <div className={`${VARIANT_CLASSES[variant]} border text-sm rounded-xl px-4 py-3 ${className}`}>
      {children}
    </div>
  )
}
