interface StatBoxProps {
  label: string
  value: number
  emoji: string
  colorClass?: string
  onClick?: () => void
}

export default function StatBox({ label, value, emoji, colorClass = 'text-brand-navy', onClick }: StatBoxProps) {
  return (
    <div
      className={`stat-box flex-1 min-w-0 ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.97] transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <div className={`text-3xl font-black ${colorClass}`}>{value}</div>
      <div className="text-[11px] text-gray-500 font-medium leading-tight mt-1">{label}</div>
      {onClick && <div className="text-[10px] text-brand-blue font-semibold mt-1">View →</div>}
    </div>
  )
}
