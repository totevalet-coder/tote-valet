'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // createBrowserClient auto-exchanges the ?code= in the URL (PKCE) when initialized.
    // Poll briefly until the session is established, then route to root.
    let attempts = 0
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      attempts++
      if (session) {
        clearInterval(interval)
        router.replace('/')
      } else if (attempts >= 10) {
        clearInterval(interval)
        router.replace('/login?error=auth_failed')
      }
    }, 300)

    return () => clearInterval(interval)
  }, [router])

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
    </div>
  )
}
