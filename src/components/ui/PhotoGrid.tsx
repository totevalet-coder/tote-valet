'use client'

import { useState } from 'react'
import PhotoThumb from './PhotoThumb'
import PhotoLightbox from './PhotoLightbox'

export interface GridPhoto {
  key: string | number
  url: string
  uploading?: boolean
  onRemove?: () => void
}

interface PhotoGridProps {
  photos: GridPhoto[]
  size?: 'sm' | 'md'
  expandable?: boolean // tap-to-fullscreen lightbox; default true
}

// Shared photo grid — renders a row of PhotoThumb tiles plus (by default)
// its own tap-to-expand lightbox, so every screen showing tote photos gets
// the same behavior without each page re-implementing expandedPhoto state.
export default function PhotoGrid({ photos, size = 'md', expandable = true }: PhotoGridProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (photos.length === 0) return null

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {photos.map(p => (
          <PhotoThumb
            key={p.key}
            src={p.url}
            size={size}
            uploading={p.uploading}
            onRemove={p.onRemove}
            onClick={expandable && !p.uploading ? () => setExpanded(p.url) : undefined}
          />
        ))}
      </div>
      {expanded && <PhotoLightbox src={expanded} onClose={() => setExpanded(null)} />}
    </>
  )
}
