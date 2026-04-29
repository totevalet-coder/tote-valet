import type { ToteStatus } from '@/types/database'

// ── Billing rates ─────────────────────────────────────────────────────────────
export const STORAGE_RATE_MONTHLY  = 15.00   // per tote / month (stored in warehouse)
export const EMPTY_TOTE_RATE_WEEKLY = 1.00   // per tote / week  (at customer home)
export const WEEKS_PER_MONTH       = 4.333   // average weeks per month
export const FREE_EXCHANGES_PER_YEAR = 2     // free tote exchanges per calendar year
export const GRACE_PERIOD_DAYS     = 8       // empty tote fee waived if pickup requested within N days
export const MISSING_TOTE_CHARGE   = 75.00   // replacement charge for unreturned tote after card disconnect

// ── Tote statuses that incur the $15/mo storage fee ──────────────────────────
export const BILLED_STORAGE_STATUSES: ToteStatus[] = [
  'stored',
  'pending_pick',
  'picked',
  'returned_to_station',
  'ready_to_stow',
  'in_transit',
]

// ── calcMonthlyTotal ──────────────────────────────────────────────────────────
// Computes the estimated monthly charge for a customer based on their totes.
// Pass the customer's totes array; returns dollar amount.
export function calcMonthlyTotal(totes: { status: string }[]): number {
  const storageTotes = totes.filter(t =>
    BILLED_STORAGE_STATUSES.includes(t.status as ToteStatus)
  )
  const emptyTotes = totes.filter(t => t.status === 'empty_at_customer')

  return (
    storageTotes.length * STORAGE_RATE_MONTHLY +
    emptyTotes.length * EMPTY_TOTE_RATE_WEEKLY * WEEKS_PER_MONTH
  )
}

// ── isInGracePeriod ───────────────────────────────────────────────────────────
// Returns true if a tote became empty_at_customer within GRACE_PERIOD_DAYS.
// emptySince: ISO timestamp of when the tote was set to empty_at_customer.
export function isInGracePeriod(emptySince: string | null): boolean {
  if (!emptySince) return false
  const days = (Date.now() - new Date(emptySince).getTime()) / (1000 * 60 * 60 * 24)
  return days <= GRACE_PERIOD_DAYS
}

// ── formatCurrency ─────────────────────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}
