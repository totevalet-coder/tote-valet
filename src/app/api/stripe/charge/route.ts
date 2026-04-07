import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { customerId } = await req.json()

  const { data: customer } = await supabase
    .from('customers')
    .select('name, email, stripe_customer_id, card_on_file, monthly_total')
    .eq('id', customerId)
    .single()

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  if (!customer.stripe_customer_id || !customer.card_on_file) {
    return NextResponse.json({ error: 'No payment method on file' }, { status: 400 })
  }

  if (!customer.monthly_total || customer.monthly_total <= 0) {
    return NextResponse.json({ error: 'No amount to charge' }, { status: 400 })
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(customer.monthly_total * 100), // cents
      currency: 'usd',
      customer: customer.stripe_customer_id,
      payment_method: customer.card_on_file,
      confirm: true,
      off_session: true,
      description: `Tote Valet monthly storage — ${customer.name}`,
    })

    if (paymentIntent.status === 'succeeded') {
      await supabase.from('customers').update({ status: 'active' }).eq('id', customerId)
      return NextResponse.json({ success: true, paymentIntentId: paymentIntent.id })
    }

    return NextResponse.json({ error: `Payment status: ${paymentIntent.status}` }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Charge failed'
    await supabase.from('customers').update({ status: 'failed_payment' }).eq('id', customerId)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
