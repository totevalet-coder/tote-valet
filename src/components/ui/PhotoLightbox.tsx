'use client'

import { X } from 'lucide-react'

interface PhotoLightboxProps {
  src: string
  onClose: () => void
}

// Full-screen photo viewer — shared by any screen that lets a customer tap
// a thumbnail to see it larger. Previously only My Items had this; Add
// Items and Edit Totes now get it for free via PhotoGrid.
export default function PhotoLightbox({ src, onClose }: PhotoLightboxProps) {
  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Tote photo" className="max-w-full max-h-full object-contain" />
      <button className="absolute top-4 right-4 bg-white/20 rounded-full p-2">
        <X className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}
