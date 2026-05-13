'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function CallbackPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    async function routeUser(userId: string) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, role')
        .eq('auth_id', userId)
        .single()

      if (!customer) {
        router.replace('/register?oauth=true')
        return
      }

      const roleRoutes: Record<string, string> = {
        customer: '/dashboard',
        driver: '/driver',
        warehouse: '/warehouse',
        sorter: '/sorter',
        admin: '/admin',
      }
      // Hard navigation so the session cookies are sent with the next request
      window.location.href = roleRoutes[customer.role] ?? '/dashboard'
    }

    // Listen for the SIGNED_IN event — fires once Supabase has processed
    // the URL hash token from the OAuth redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        subscription.unsubscribe()
        routeUser(session.user.id)
      }
    })

    // Fallback: session may already exist if user was previously signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        subscription.unsubscribe()
        routeUser(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
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
