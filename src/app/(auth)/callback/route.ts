import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.user) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, role')
        .eq('auth_id', data.user.id)
        .single()

      if (!customer) {
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

    const msg = error?.message ?? 'no_user'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
