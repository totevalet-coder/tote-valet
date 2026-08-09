// The "Warehouse Pool" is a placeholder customers row representing
// unassigned company inventory — not a real person or a login. Every tote
// in this schema must have SOME customer_id (not-null FK), so when an
// empty tote is picked up from a customer it has nothing left to "belong"
// to conceptually — it's just a reusable empty container again, not
// storing anything for anyone. Reassigning it here (instead of leaving it
// on the customer who last had it) is what makes it correctly disappear
// from that customer's Inventory/Billing/My Items views, stop being
// billed, and show up as company-owned everywhere it's displayed.
//
// role: 'customer' (no dedicated enum value added — user_role is a fixed
// Postgres enum and adding a value needs a migration, which this
// deliberately avoids). Has no auth_id, so it can never log in and the
// existing totes_owner_read RLS policy (scoped to auth.uid()) can never
// match it. MUST be excluded explicitly from every real
// customer-listing/aggregate query (Customers page, Billing's
// by-customer list + MRR, the route builder's customer dropdown) — see
// callers of WAREHOUSE_POOL_CUSTOMER_ID for the current list.
export const WAREHOUSE_POOL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000001'
export const WAREHOUSE_POOL_CUSTOMER_NAME = 'Warehouse Pool'
