'use client'

import type { LucideIcon } from 'lucide-react'

interface ComingSoonProps {
  title: string
  icon: LucideIcon
  phase: string
  description: string
}

export default function ComingSoon({ title, icon: Icon, phase, description }: ComingSoonProps) {
  return (
    <div className="p-6 max-w-[1400px]">
      <h1 className="font-black text-2xl text-brand-navy mb-6">{title}</h1>
      <div className="card p-12 text-center max-w-md mx-auto">
        <div className="w-14 h-14 bg-brand-navy/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Icon className="w-7 h-7 text-brand-navy/40" />
        </div>
        <p className="font-bold text-gray-500">Coming in {phase}</p>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>
    </div>
  )
}
