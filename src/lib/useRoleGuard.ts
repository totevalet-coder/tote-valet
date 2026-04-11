'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ROLE_HOME: Record<string, string> = {
  customer:  '/dashboard',
  admin:     '/admin',
  driver:    '/driver',
  warehouse: '/warehouse',
  sorter:    '/sorter',
}

/**
 * Checks that the logged-in user has one of the allowed roles.
 * - Not logged in  → /landing
 * - Wrong role     → their own home dashboard
 * Returns `checking: true` while the auth check is in flight.
 */
export function useRoleGuard(allowedRoles: string[]) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function verify() {
      const { data: { user } } = await supabase.auth.getUser()

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
        router.replace('/landing')
        return
      }

      if (!allowedRoles.includes(customer.role)) {
        router.replace(ROLE_HOME[customer.role] ?? '/landing')
        return
      }

      setChecking(false)
    }

    verify()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { checking }
}
