'use client'

import { Loader2, PackageCheck } from 'lucide-react'

interface Item {
  label: string
  ai_generated?: boolean
}

interface Props {
  toteName: string
  toteId?: string
  items: Item[]
  photoUrls: string[]
  onConfirm: () => void
  onBack: () => void
  confirming?: boolean
}

// Shared between Add Items and Edit Totes — a final "does this actually
// match what's physically in the tote" checkpoint before anything saves.
export default function ToteConfirmReview({ toteName, toteId, items, photoUrls, onConfirm, onBack, confirming }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-brand-navy">Confirm Tote Contents</h1>
        <p className="text-gray-500 text-sm mt-1">
          Please confirm these items are physically in the tote before saving.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <PackageCheck className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <p className="font-black text-brand-navy text-sm">{toteName}</p>
            {toteId && <p className="text-xs text-gray-400">{toteId}</p>}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Items ({items.length})</p>
          {items.length > 0 ? (
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                  {item.label}
                  {item.ai_generated && <span className="text-xs flex-shrink-0" title="Detected from photo">✨</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 italic">This tote will be saved as empty.</p>
          )}
        </div>

        {photoUrls.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Photos ({photoUrls.length})</p>
            <div className="flex gap-2 flex-wrap">
              {photoUrls.map((url, i) => (
                <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
          Yes, This Is Accurate
        </button>
        <button
          onClick={onBack}
          disabled={confirming}
          className="btn-outline w-full disabled:opacity-50"
        >
          Go Back &amp; Edit
        </button>
      </div>
    </div>
  )
}
