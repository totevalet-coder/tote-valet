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
    const { customerId, customerEmail, customerName } = await req.json()

    let stripeCustomerId: string

    if (customerId) {
      // Existing Supabase customer
      const { data: customer } = await supabase
        .from('customers')
        .select('email, name, stripe_customer_id')
        .eq('id', customerId)
        .single()

      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

      if (customer.stripe_customer_id) {
        stripeCustomerId = customer.stripe_customer_id
      } else {
        const sc = await stripe.customers.create({
          email: customer.email,
          name: customer.name,
          metadata: { supabase_id: customerId },
        })
        stripeCustomerId = sc.id
        await supabase.from('customers').update({ stripe_customer_id: sc.id }).eq('id', customerId)
      }
    } else {
      // New customer during registration — create Stripe customer with provided info
      const sc = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
      })
      stripeCustomerId = sc.id
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    })

    return NextResponse.json({ clientSecret: setupIntent.client_secret, stripeCustomerId })
  } catch (err) {
    console.error('[stripe/setup-intent]', err)
    return NextResponse.json({ error: 'Failed to create setup intent' }, { status: 500 })
  }
}
