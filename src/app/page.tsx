import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/landing')
  }

  // Fast path: look up by auth_id
  let { data: customer } = await supabase
    .from('customers')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  // Fallback: if auth_id doesn't match any row, find by email and self-heal
  if (!customer && user.email) {
    const adminClient = await createAdminClient()
    const { data: byEmail } = await adminClient
      .from('customers')
      .select('id, role')
      .eq('email', user.email)
      .single()

    if (byEmail) {
      await adminClient
        .from('customers')
        .update({ auth_id: user.id })
        .eq('id', byEmail.id)
      customer = byEmail
    }
  }

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
