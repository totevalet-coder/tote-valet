import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { customerId, paymentMethodId, stripeCustomerId } = await req.json()

    if (!customerId || !paymentMethodId || !stripeCustomerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Retrieve card details from Stripe to store last4 + brand
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    const last4 = pm.card?.last4 ?? ''
    const brand = pm.card?.brand ?? ''

    await supabase.from('customers').update({
      card_on_file: paymentMethodId,
      stripe_customer_id: stripeCustomerId,
      // Store display info in notes-style field for quick access
    }).eq('id', customerId)

    return NextResponse.json({ success: true, last4, brand })
  } catch (err) {
    console.error('[stripe/save-card]', err)
    return NextResponse.json({ error: 'Failed to save card' }, { status: 500 })
  }
}
