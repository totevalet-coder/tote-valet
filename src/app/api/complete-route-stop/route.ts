import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcMonthlyTotal } from '@/lib/billing'

// Service-role client — bypasses RLS. The driver browser client updating
// tote_requests directly was a likely-silent no-op: routes/totes/errors
// all have documented driver-write GRANTs, but tote_requests never did
// (see CLAUDE.md's GRANTs section), and a failed .update() from the
// client doesn't throw, so completeLinkedOrder's write could fail with
// nothing ever surfacing it. Doing this one narrow, well-defined side
// effect server-side sidesteps needing to guess at / patch the live RLS
// policy on a table drivers otherwise have no business writing to broadly.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface OrderRef {
  source: 'tote_request' | 'pickup_flag'
  sourceId: string
}

export async function POST(req: NextRequest) {
  try {
    const { toteIds, type, orderRef, customerId } = await req.json() as {
      toteIds: string[]
      type: 'pickup' | 'delivery'
      orderRef?: OrderRef
      customerId?: string
    }

    // Pickup stops: whatever totes actually got picked up are no longer
    // "awaiting pickup" from the customer's perspective, regardless of
    // which flow originally set the flag (a tote_requests row, the legacy
    // totes.pickup_requested-only path, or both at once — see my-items'
    // dual-write). Clear it on every tote this stop picked up so My Items
    // stops showing a stale "Pickup Requested" badge on totes that are
    // already stowed in the warehouse.
    if (type === 'pickup' && Array.isArray(toteIds) && toteIds.length > 0) {
      await supabase.from('totes').update({ pickup_requested: false }).in('id', toteIds)
    }

    if (orderRef?.source === 'tote_request') {
      await supabase.from('tote_requests').update({
        status: 'complete',
        completed_at: new Date().toISOString(),
      }).eq('id', orderRef.sourceId)
    } else if (orderRef?.source === 'pickup_flag' && type !== 'pickup') {
      // Only reachable for a legacy flag on a non-pickup stop, which
      // doesn't happen in practice today — the pickup-type branch above
      // already covers the real case. Kept for completeness.
      await supabase.from('totes').update({ pickup_requested: false }).eq('id', orderRef.sourceId)
    }

    // Recalculate this customer's real-time bill instead of leaving it to
    // whatever it was until an admin next clicks "Recalculate" on the
    // Billing page. Previously a tote's status could change completely
    // (picked up, delivered, returned) with monthly_total never updating
    // until that manual batch sync — confirmed as a real bug 2026-08-08:
    // an empty tote picked up from a customer and returned to the
    // warehouse kept the customer's bill exactly where it was (still
    // showing the full $15/mo storage charge for a tote that, by the time
    // this runs, calcMonthlyTotal no longer even counts as billable).
    if (customerId) {
      const { data: totes } = await supabase.from('totes').select('status, items').eq('customer_id', customerId)
      if (totes) {
        const total = calcMonthlyTotal(totes as { status: string; items: unknown[] | null }[])
        await supabase.from('customers').update({ monthly_total: total }).eq('id', customerId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[complete-route-stop] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
