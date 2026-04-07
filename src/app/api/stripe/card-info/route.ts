import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })

  const { data: customer } = await supabase
    .from('customers')
    .select('card_on_file')
    .eq('id', customerId)
    .single()

  if (!customer?.card_on_file) {
    return NextResponse.json({ card: null })
  }

  try {
    const pm = await stripe.paymentMethods.retrieve(customer.card_on_file)
    return NextResponse.json({
      card: {
        last4: pm.card?.last4 ?? '',
        brand: pm.card?.brand ?? '',
        exp_month: pm.card?.exp_month ?? 0,
        exp_year: pm.card?.exp_year ?? 0,
      },
    })
  } catch {
    return NextResponse.json({ card: null })
  }
}
