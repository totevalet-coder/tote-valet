import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  console.log('[callback] getUser result:', user?.id, user?.email, user ? 'OK' : 'NULL')
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  // Use admin client for all DB lookups — bypasses RLS entirely
  const adminClient = createAdminClient()

  // Look up customer by auth_id (fast path)
  const { data: customer1, error: err1 } = await adminClient
    .from('customers')
    .select('id, role')
    .eq('auth_id', user.id)
    .single()
  console.log('[callback] auth_id lookup:', JSON.stringify(customer1), 'err:', err1?.message)

  let customer = customer1

  // Fallback: match by email and self-heal auth_id
  if (!customer && user.email) {
    const { data: byEmail, error: err2 } = await adminClient
      .from('customers')
      .select('id, role')
      .eq('email', user.email)
      .single()
    console.log('[callback] email fallback:', JSON.stringify(byEmail), 'err:', err2?.message)

    if (byEmail) {
      await adminClient.from('customers').update({ auth_id: user.id }).eq('id', byEmail.id)
      customer = byEmail
    }
  }

  console.log('[callback] final customer:', JSON.stringify(customer), '→ routing to:', customer ? (customer.role ?? 'unknown') : 'register')

  if (!customer) {
    // Genuinely new user — send to registration
    return NextResponse.redirect(`${origin}/register?oauth=true`)
  }

  const roleRoutes: Record<string, string> = {
    customer: '/dashboard',
    driver: '/driver',
    warehouse: '/warehouse',
    sorter: '/sorter',
    admin: '/admin',
  }

  return NextResponse.redirect(`${origin}${roleRoutes[customer.role] ?? '/dashboard'}`)
}
