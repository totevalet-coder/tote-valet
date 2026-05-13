'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function ConfirmPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    async function confirm() {
      const params = new URLSearchParams(window.location.search)
      const token_hash = params.get('token_hash')
      const type = params.get('type') as 'recovery' | 'signup' | 'email' | null
      const next = params.get('next') ?? '/dashboard'

      if (!token_hash || !type) {
        router.replace('/login?error=invalid_link')
        return
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash, type })
      if (error) {
        router.replace(`/forgot-password?error=${encodeURIComponent(error.message)}`)
        return
      }

      router.replace(next)
    }

    confirm()
  }, [supabase, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
        <p className="text-white font-semibold">Verifying…</p>
      </div>
    </div>
  )
}
