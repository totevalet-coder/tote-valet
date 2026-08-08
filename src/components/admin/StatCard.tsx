'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, type LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  total?: number | string
  subtext?: string
  icon?: LucideIcon
  valueColor?: string
  linkLabel?: string
  linkHref?: string
}

export default function StatCard({
  label, value, total, subtext, icon: Icon, valueColor = 'text-brand-navy', linkLabel, linkHref,
}: StatCardProps) {
  const router = useRouter()

  return (
    <div className="card p-5 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-gray-300" />}
      </div>
      <p className={`font-black text-3xl ${valueColor}`}>
        {value}
        {total !== undefined && <span className="text-gray-300 text-xl font-bold"> / {total}</span>}
      </p>
      {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
      {linkLabel && linkHref && (
        <button
          onClick={() => router.push(linkHref)}
          className="flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline pt-1"
        >
          {linkLabel} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
