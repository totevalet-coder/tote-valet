'use client'

import { Trash2 } from 'lucide-react'

interface Props {
  label: string
  aiGenerated?: boolean
  /** True when this is an AI-suggested label the customer hasn't explicitly confirmed yet. */
  needsAccept?: boolean
  onLabelChange?: (label: string) => void
  /** Called when the customer taps "Accept", or edits the text (editing counts as acceptance). */
  onAccept?: () => void
  /** Omit to hide the remove button (e.g. the last remaining item). */
  onRemove?: () => void
  /** Fully non-interactive display — no input, no buttons. Used for read-only totes. */
  readOnly?: boolean
  placeholder?: string
  autoFocus?: boolean
}

// Shared between Add Items and Edit Totes so both flows look and behave the
// same way for individual item rows, instead of each maintaining its own copy.
export default function ToteItemRow({
  label,
  aiGenerated,
  needsAccept,
  onLabelChange,
  onAccept,
  onRemove,
  readOnly,
  placeholder = 'Item',
  autoFocus,
}: Props) {
  if (readOnly) {
    return (
      <li className="text-sm text-gray-600 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
        {label}
        {aiGenerated && <span className="text-xs flex-shrink-0" title="Detected from photo">✨</span>}
      </li>
    )
  }

  return (
    <div className={`flex items-center gap-2 rounded-xl transition-colors ${needsAccept ? 'bg-amber-50 border border-amber-200 px-2 py-1.5' : ''}`}>
      {aiGenerated && (
        <span className="text-xs flex-shrink-0" title="Detected from photo">✨</span>
      )}
      <input
        type="text"
        value={label}
        onChange={e => {
          onLabelChange?.(e.target.value)
          if (needsAccept) onAccept?.()
        }}
        placeholder={placeholder}
        className="input-field flex-1"
        autoFocus={autoFocus}
      />
      {needsAccept && (
        <button
          type="button"
          onClick={onAccept}
          className="flex-shrink-0 text-xs font-semibold bg-amber-400 text-amber-900 px-3 py-1.5 rounded-full hover:bg-amber-500 transition-colors"
        >
          Accept
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
