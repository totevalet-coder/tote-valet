import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

export async function POST(req: NextRequest) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    return NextResponse.json(
      { error: 'Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env.local.' },
      { status: 503 }
    )
  }

  try {
    const { to, message } = await req.json()
    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    const client = twilio(sid, token)
    const msg = await client.messages.create({ body: message, from, to })
    return NextResponse.json({ success: true, sid: msg.sid })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send SMS'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
