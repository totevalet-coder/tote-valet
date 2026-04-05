interface StatBoxProps {
  label: string
  value: number
  emoji: string
  colorClass?: string
}

export default function StatBox({ label, value, emoji, colorClass = 'text-brand-navy' }: StatBoxProps) {
  return (
    <div className="stat-box flex-1 min-w-0">
      <div className="text-2xl mb-1">{emoji}</div>
      <div className={`text-3xl font-black ${colorClass}`}>{value}</div>
      <div className="text-[11px] text-gray-500 font-medium leading-tight mt-1">{label}</div>
    </div>
  )
}
