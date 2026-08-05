'use client'

import { CheckCircle2 } from 'lucide-react'

interface SelectableToteRowProps {
  toteName: string | null
  toteId: string
  subtitle: string
  emoji?: string
  selected: boolean
  onClick: () => void
}

// Shared "tap to select a tote" row — used by My Items' pickup, return, and
// empty-return sub-flows, which each independently hand-rolled this same
// card/emoji/name/subtitle/checkmark pattern.
export default function SelectableToteRow({ toteName, toteId, subtitle, emoji = '📦', selected, onClick }: SelectableToteRowProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full card flex items-center gap-4 transition-all duration-150 ${
        selected ? 'border-2 border-brand-blue bg-brand-blue/5 shadow-md' : 'hover:shadow-md'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center flex-shrink-0 text-xl">{emoji}</div>
      <div className="flex-1 text-left min-w-0">
        <p className="font-bold text-brand-navy text-sm truncate">{toteName ?? toteId}</p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      {selected && <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />}
    </button>
  )
}
