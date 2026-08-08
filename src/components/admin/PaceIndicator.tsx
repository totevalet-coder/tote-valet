'use client'

interface PaceIndicatorProps {
  label: string
  current: number
  target: number
  elapsedPct: number   // % of shift elapsed — the "expected progress" line
  amberPts?: number    // behind-pace threshold, in percentage points, before amber
  redPts?: number       // behind-pace threshold, in percentage points, before red
}

export default function PaceIndicator({
  label, current, target, elapsedPct, amberPts = 10, redPts = 25,
}: PaceIndicatorProps) {
  const actualPct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const deltaPts = Math.round(actualPct - elapsedPct)

  let badge: { text: string; color: string }
  if (deltaPts >= 0) {
    badge = { text: 'Ahead of Pace', color: 'bg-green-100 text-green-700' }
  } else if (deltaPts > -amberPts) {
    badge = { text: 'On Pace', color: 'bg-gray-100 text-gray-600' }
  } else if (deltaPts > -redPts) {
    badge = { text: 'Behind Pace', color: 'bg-amber-100 text-amber-700' }
  } else {
    badge = { text: 'Behind Pace', color: 'bg-red-100 text-red-700' }
  }

  const barColor = deltaPts >= 0 ? 'bg-green-500' : deltaPts > -amberPts ? 'bg-gray-400' : deltaPts > -redPts ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <span className={`status-pill text-[10px] font-bold ${badge.color}`}>{badge.text}</span>
      </div>
      <p className="font-black text-2xl text-brand-navy">
        {current}<span className="text-gray-300 text-lg font-bold"> / {target}</span>
      </p>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${actualPct}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-brand-navy/40"
          style={{ left: `${Math.min(100, elapsedPct)}%` }}
          title="Expected progress for this point in the shift"
        />
      </div>
      <p className="text-[10px] text-gray-400">
        vs. % of shift elapsed — {Math.abs(deltaPts)}pt{Math.abs(deltaPts) !== 1 ? 's' : ''} {deltaPts >= 0 ? 'ahead' : 'behind'}
      </p>
    </div>
  )
}
