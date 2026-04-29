'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, X } from 'lucide-react'
import { getViewAsRole, clearViewAsRole } from '@/lib/adminViewAs'

export default function AdminViewingBanner() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    setRole(getViewAsRole())
  }, [])

  if (!role) return null

  function handleBack() {
    clearViewAsRole()
    router.push('/admin')
  }

  const label = role.charAt(0).toUpperCase() + role.slice(1)

  return (
    <div className="sticky top-0 z-50 bg-orange-500 px-4 py-2 flex items-center gap-2">
      <ShieldCheck className="w-4 h-4 text-white flex-shrink-0" />
      <p className="text-white text-xs font-bold flex-1">
        Admin viewing as <span className="uppercase">{label}</span>
      </p>
      <button
        onClick={handleBack}
        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg px-2.5 py-1 transition-colors"
      >
        <X className="w-3 h-3" /> Exit
      </button>
    </div>
  )
}
