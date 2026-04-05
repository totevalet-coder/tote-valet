'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function CallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function handleCallback() {
      // Wait briefly for Supabase to process the token from the URL fragment
      await new Promise(resolve => setTimeout(resolve, 500))

      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session?.user) {
        router.push('/login?error=auth_failed')
        return
      }

      const user = session.user

      // Check if customer record exists
      const { data: customer } = await supabase
        .from('customers')
        .select('id, role')
        .eq('auth_id', user.id)
        .single()

      if (!customer) {
        // First time — go to onboarding
        router.push('/register?oauth=true')
        return
      }

      // Route by role
      const roleRoutes: Record<string, string> = {
        customer: '/dashboard',
        driver: '/driver',
        warehouse: '/warehouse',
        sorter: '/sorter',
        admin: '/admin',
      }
      router.push(roleRoutes[customer.role] ?? '/dashboard')
    }

    handleCallback()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
        <p className="text-white font-semibold">Signing you in...</p>
      </div>
    </div>
  )
}
