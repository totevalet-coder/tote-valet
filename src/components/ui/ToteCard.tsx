import type { Tote } from '@/types/database'
import { Package, ChevronRight } from 'lucide-react'

interface ToteCardProps {
  tote: Tote
  onClick?: () => void
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  stored: { label: 'In Warehouse', bg: 'bg-blue-100', text: 'text-blue-700' },
  in_transit: { label: 'In Transit', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  empty_at_customer: { label: 'At Home (Empty)', bg: 'bg-gray-100', text: 'text-gray-600' },
  ready_to_stow: { label: 'Ready to Stow', bg: 'bg-purple-100', text: 'text-purple-700' },
  pending_pick: { label: 'Pickup Pending', bg: 'bg-orange-100', text: 'text-orange-700' },
  picked: { label: 'Picked Up', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  returned_to_station: { label: 'At Station', bg: 'bg-teal-100', text: 'text-teal-700' },
  error: { label: 'Error', bg: 'bg-red-100', text: 'text-red-700' },
}

const TOTE_EMOJIS = ['📦', '🧳', '🎒', '🗃️', '🧺', '📫']

function getToteEmoji(id: string) {
  const idx = parseInt(id.replace(/\D/g, '') || '0', 10) % TOTE_EMOJIS.length
  return TOTE_EMOJIS[idx]
}

export default function ToteCard({ tote, onClick }: ToteCardProps) {
  const statusCfg = STATUS_CONFIG[tote.status] ?? {
    label: tote.status,
    bg: 'bg-gray-100',
    text: 'text-gray-600',
  }

  const itemPreview = tote.items.slice(0, 3).map(i => i.label).join(', ')
  const extraItems = tote.items.length > 3 ? ` +${tote.items.length - 3} more` : ''

  return (
    <button
      onClick={onClick}
      className="card w-full text-left flex items-center gap-4 hover:shadow-md active:scale-[0.98] transition-all duration-150"
    >
      {/* Emoji / Icon */}
      <div className="w-14 h-14 rounded-2xl bg-brand-navy/5 flex items-center justify-center flex-shrink-0">
        <span className="text-2xl">{tote.tote_name ? getToteEmoji(tote.id) : '📦'}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-brand-navy text-sm truncate">
            {tote.tote_name ?? tote.id}
          </span>
          <span
            className={`status-pill ${statusCfg.bg} ${statusCfg.text} whitespace-nowrap`}
          >
            {statusCfg.label}
          </span>
        </div>

        <p className="text-xs text-gray-400 truncate">
          {tote.items.length === 0
            ? 'No items logged'
            : `${itemPreview}${extraItems}`}
        </p>

        {tote.seal_number && (
          <p className="text-xs text-gray-300 mt-0.5">Seal: {tote.seal_number}</p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </button>
  )
}

// Re-export a compact icon variant for use in lists
export function ToteIcon({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`status-pill ${cfg.bg} ${cfg.text}`}>
      <Package className="w-3 h-3 mr-1" />
      {cfg.label}
    </span>
  )
}
