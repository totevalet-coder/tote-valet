'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      // getSession reads from local cookies — no network needed on app open
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user ?? null

      if (!user) {
        router.replace('/landing')
        return
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('role')
        .eq('auth_id', user.id)
        .single()

      if (!customer) {
        router.replace('/login')
        return
      }

      const routes: Record<string, string> = {
        customer: '/dashboard',
        driver: '/driver',
        warehouse: '/warehouse',
        sorter: '/sorter',
        admin: '/admin',
      }

      router.replace(routes[customer.role] ?? '/dashboard')
    }

    checkAuth()
  }, [router])

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
    </div>
  )
}
