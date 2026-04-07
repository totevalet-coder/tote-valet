import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const stripeCustomerId = (event.data.object as { customer?: string }).customer

  switch (event.type) {
    case 'payment_intent.succeeded':
      if (stripeCustomerId) {
        await supabase.from('customers')
          .update({ status: 'active' })
          .eq('stripe_customer_id', stripeCustomerId)
      }
      break

    case 'payment_intent.payment_failed':
      if (stripeCustomerId) {
        await supabase.from('customers')
          .update({ status: 'failed_payment' })
          .eq('stripe_customer_id', stripeCustomerId)
        // Send notification
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('stripe_customer_id', stripeCustomerId)
          .single()
        if (customer) {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customer.id,
              title: 'Payment failed ⚠️',
              body: 'We were unable to process your monthly payment. Please update your card in the app.',
              type: 'failed_payment',
            }),
          })
        }
      }
      break

    case 'setup_intent.succeeded':
      // Card was saved successfully — no action needed, handled client-side
      break
  }

  return NextResponse.json({ received: true })
}
