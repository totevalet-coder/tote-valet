'use client'

interface SkeletonBlockProps {
  className?: string // size/shape, e.g. "h-20 rounded-2xl" or "flex-1 h-24 rounded-2xl"
}

// A single pulsing placeholder block. The "bg-gray-200 animate-pulse" base
// was hand-copied at every loading state across the customer portal
// (Dashboard, Billing, My Items, Notifications, Profile, Edit Totes) —
// this is the one thing that was actually identical everywhere; sizing
// varies by context and stays caller-controlled via className.
export function SkeletonBlock({ className = 'h-20 rounded-2xl' }: SkeletonBlockProps) {
  return <div className={`bg-gray-200 animate-pulse ${className}`} />
}

interface SkeletonListProps {
  count?: number
  itemClassName?: string
  wrapperClassName?: string
}

// A row/column of SkeletonBlocks — saves re-writing the .map(i => ...)
// boilerplate at every list loading state.
export function SkeletonList({ count = 3, itemClassName = 'h-20 rounded-2xl', wrapperClassName = 'space-y-3' }: SkeletonListProps) {
  return (
    <div className={wrapperClassName}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className={itemClassName} />
      ))}
    </div>
  )
}
