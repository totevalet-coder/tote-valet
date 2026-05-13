'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function CallbackPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    async function handleCallback() {
      // Explicitly extract tokens from the URL hash (implicit OAuth flow)
      const hash = window.location.hash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const access_token = hashParams.get('access_token')
      const refresh_token = hashParams.get('refresh_token')

      if (access_token && refresh_token) {
        // setSession explicitly so we use the new OAuth tokens, not any stale cookie session
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) {
          router.replace('/login?error=auth_failed')
          return
        }
      } else {
        // No hash tokens — verify there's at least an existing session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.replace('/login?error=auth_failed')
          return
        }
      }

      // Let the root page handle role routing (and self-heal auth_id if needed)
      window.location.href = '/'
    }

    handleCallback()
  }, [supabase, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
        <p className="text-white font-semibold">Signing you in...</p>
      </div>
    </div>
  )
}
