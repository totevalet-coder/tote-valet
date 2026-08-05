'use client'

import { Loader2, X } from 'lucide-react'

interface PhotoThumbProps {
  src: string
  alt?: string
  size?: 'sm' | 'md'
  onClick?: () => void   // tap-to-expand; omit for a non-interactive thumb
  onRemove?: () => void  // delete X button; omit when read-only
  uploading?: boolean    // spinner overlay, disables interaction
}

// Shared photo tile — used anywhere a tote photo shows up as a thumbnail
// (Add Items, Edit Totes, My Items, ToteConfirmReview). Keeps size/border/
// rounding consistent and gives every screen the same tap-to-expand and
// delete-X behavior instead of each page hand-rolling its own <img> markup.
export default function PhotoThumb({ src, alt = 'Tote photo', size = 'md', onClick, onRemove, uploading }: PhotoThumbProps) {
  const dim = size === 'sm' ? 'w-16 h-16 rounded-lg' : 'w-20 h-20 rounded-xl'

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="w-full h-full object-cover" />
  )

  return (
    <div className={`relative ${dim} overflow-hidden border border-gray-200 flex-shrink-0`}>
      {onClick && !uploading ? (
        <button type="button" onClick={onClick} className="w-full h-full block hover:opacity-90 transition-opacity">
          {image}
        </button>
      ) : image}

      {uploading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        </div>
      )}

      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  )
}
