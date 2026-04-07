import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

// Service-role client — bypasses RLS for server-side writes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { customer_id, title, body, type } = await req.json()

    if (!customer_id || !title || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Create in-app notification
    await supabase.from('notifications').insert({ customer_id, title, body, type: type ?? 'general' })

    // 2. Send SMS if Twilio is configured
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_PHONE_NUMBER

    if (sid && token && from) {
      const { data: customer } = await supabase
        .from('customers')
        .select('phone, name')
        .eq('id', customer_id)
        .single()

      if (customer?.phone) {
        try {
          const client = twilio(sid, token)
          await client.messages.create({
            body: `Tote Valet: ${body}`,
            from,
            to: customer.phone,
          })
        } catch (smsErr) {
          // Log but don't fail — in-app notification was already created
          console.error('[notify] SMS failed:', smsErr)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
