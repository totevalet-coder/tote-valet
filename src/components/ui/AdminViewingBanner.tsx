'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { clearViewAsRole } from '@/lib/adminViewAs'

interface Props {
  // The portal this banner is rendered inside — always shown for admins,
  // regardless of how they got here (View As picker or direct navigation).
  portal: 'customer' | 'driver' | 'warehouse' | 'sorter'
}

export default function AdminViewingBanner({ portal }: Props) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: customer } = await supabase
        .from('customers')
        .select('role')
        .eq('auth_id', data.user.id)
        .single()
      if (customer?.role === 'admin') setIsAdmin(true)
    })
  }, [])

  if (!isAdmin) return null

  function handleBack() {
    clearViewAsRole()
    router.push('/admin')
  }

  const label = portal.charAt(0).toUpperCase() + portal.slice(1)

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
