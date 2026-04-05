import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if this user already has a customer record
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, role')
          .eq('auth_id', user.id)
          .single()

        if (!customer) {
          // First time Google login — send to onboarding to complete profile
          return NextResponse.redirect(`${origin}/register?oauth=true`)
        }

        // Existing user — route by role
        const roleRoutes: Record<string, string> = {
          customer: '/dashboard',
          driver: '/driver',
          warehouse: '/warehouse',
          sorter: '/sorter',
          admin: '/admin',
        }
        const dest = roleRoutes[customer.role] ?? '/dashboard'
        return NextResponse.redirect(`${origin}${dest}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
