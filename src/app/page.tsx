import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  console.log('[root] getUser:', user?.id, user?.email, user ? 'OK' : 'NULL')
  if (!user) {
    redirect('/landing')
  }

  // Use admin client for all DB lookups — bypasses RLS entirely
  const adminClient = createAdminClient()

  // Fast path: look up by auth_id
  const { data: customer1, error: rootErr1 } = await adminClient
    .from('customers')
    .select('id, role')
    .eq('auth_id', user!.id)
    .single()
  console.log('[root] auth_id lookup:', JSON.stringify(customer1), 'err:', rootErr1?.message)

  let customer = customer1

  // Fallback: if auth_id doesn't match any row, find by email and self-heal
  if (!customer && user!.email) {
    const { data: byEmail, error: rootErr2 } = await adminClient
      .from('customers')
      .select('id, role')
      .eq('email', user!.email)
      .single()
    console.log('[root] email fallback:', JSON.stringify(byEmail), 'err:', rootErr2?.message)

    if (byEmail) {
      await adminClient
        .from('customers')
        .update({ auth_id: user!.id })
        .eq('id', byEmail.id)
      customer = byEmail
    }
  }

  console.log('[root] final customer:', JSON.stringify(customer))
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
