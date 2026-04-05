import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Look up role and redirect to appropriate dashboard
  const { data: customer } = await supabase
    .from('customers')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!customer) {
    redirect('/login')
  }

  const roleRoutes: Record<string, string> = {
    customer: '/dashboard',
    driver: '/driver',
    warehouse: '/warehouse',
    sorter: '/sorter',
    admin: '/admin',
  }

  redirect(roleRoutes[customer.role] ?? '/dashboard')
}
