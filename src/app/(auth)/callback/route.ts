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
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  // Look up customer by auth_id (fast path)
  let { data: customer } = await supabase
    .from('customers')
    .select('id, role')
    .eq('auth_id', user.id)
    .single()

  // Fallback: match by email and self-heal auth_id
  if (!customer && user.email) {
    const adminClient = await createAdminClient()
    const { data: byEmail } = await adminClient
      .from('customers')
      .select('id, role')
      .eq('email', user.email)
      .single()

    if (byEmail) {
      await adminClient.from('customers').update({ auth_id: user.id }).eq('id', byEmail.id)
      customer = byEmail
    }
  }

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
