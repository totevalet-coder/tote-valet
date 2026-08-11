# Tote Valet — Claude Code Context
*Drop this file in your repo root. Claude Code reads it automatically every session.*
*Last updated: August 2026*

---

## What Is This App?
A tote pickup, storage, and delivery service for the **Lehigh Valley, PA**. Customers schedule pickups, we collect packed totes, store them in a warehouse, deliver back on demand — all managed through this web app.

- **Live app:** https://tote-valet.vercel.app
- **Landing page:** https://tote-valet.vercel.app/landing
- **Owner:** John, Lehigh Valley PA

---

## Tech Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database + Auth | Supabase |
| Payments | Stripe |
| SMS | Twilio |
| AI Labeling | Anthropic Claude API (`claude-sonnet-5`) |
| Deployment | Vercel |
| Version Control | GitHub |

---

## Project Structure
```
src/
├── app/
│   ├── (admin)/admin/          # Admin portal
│   ├── (customer)/             # Customer portal
│   ├── (driver)/driver/        # Driver portal
│   ├── (warehouse)/warehouse/  # Warehouse portal
│   ├── (sorter)/sorter/        # Sorter portal
│   ├── (auth)/                 # Login/register/reset/oauth
│   ├── api/
│   │   ├── stripe/             # Webhooks + charge/save-card
│   │   ├── send-sms/           # Twilio SMS
│   │   ├── notify/             # Notifications
│   │   └── ai-label/           # Claude AI item labeling
│   └── landing/                # Public marketing page
├── components/ui/              # Shared UI components
├── lib/
│   ├── supabase/               # Supabase client + server
│   ├── billing.ts              # Stripe billing logic
│   ├── adminViewAs.ts          # Admin impersonation
│   └── useRoleGuard.ts         # Role-based access
├── types/database.ts           # ALL TypeScript types — source of truth
└── middleware.ts               # Auth + role-based routing
supabase/schema.sql             # Full DB schema — source of truth
```

**Always check `src/types/database.ts` and `supabase/schema.sql` before touching data models.**

---

## User Roles
`customer | driver | warehouse | sorter | admin`

Supabase handles all auth. Middleware enforces role-based routing. Admin can impersonate customers via `adminViewAs.ts`.

---

## Portals & Pages

### Customer (`/customer`)
Dashboard, My Items, Add Items (AI-assisted), Request Totes, Billing, Profile, Notifications, Help, Menu

### Driver (`/driver`)
Dashboard, Load Truck, Stop-by-Stop, End Route, Return

### Warehouse (`/warehouse`)
Dashboard, Scan & Store, Sort, Sort > Load, Sort > Staging, Pick Lists, Pick List Detail, Reports
⚠️ TODO: Add "Sort" under Quick Actions, "Sort" under Reports, Live Inventory "unsorted" view

### Sorter (`/sorter`)
Dashboard, Staging, Load, Load by Route

### Admin (`/admin`)
Dashboard, Customers, Staff, Routes, Totes, Requests, Monitor, Billing, Settings, Errors

---

## Dates & "Today"

**Never write `new Date().toISOString().split('T')[0]` (or any raw UTC slice) to mean "today."** It reads the UTC calendar date, which silently differs from the business's actual local date for ~4-5 hours every evening (roughly 8pm-midnight Eastern) — confirmed live 2026-08-08 as a real bug affecting ~24 call sites across 19 files (route creation defaults, every "Today" filter, Sort's/drivers' "does a route exist today" lookups, joined_date, etc. — see project memory for the full incident writeup).

Use `src/lib/date.ts` instead, always:
- `todayStr()` — today's date as YYYY-MM-DD in `America/New_York` (the business's actual timezone), regardless of the server's or viewing device's own timezone.
- `localDateStrFromISO(iso)` — which business-local calendar day a stored timestamp falls on (for grouping/filtering by day).
- `localDayBoundsUTC(dateStr)` — correct UTC start/end instants for a local calendar day, for filtering a `timestamptz` column (e.g. `pick_lists.generated_at`) by date.

## Data Model — Key ID Formats
- Totes: `TV-XXXX` (pre-printed barcodes)
- Seals: `SL-XXXX` (plastic security seals)
- Bins: `A-12` (row letter + number)
- Routes: `RT-XXX`
- Pick Lists: `PL-2026-XXX`
- Errors: `ERR-XXXXX`

## Status Enums

**ToteStatus:**
`empty_at_customer | in_transit | ready_to_stow | stored | pending_pick | picked | returned_to_station | error`

**RouteStatus:**
`planned | in_progress | returning | complete`

**PickListStatus:**
`ready | in_progress | complete`

**AccountStatus:**
`active | suspended | failed_payment`

## Warehouse Pool (placeholder customer)

`src/lib/warehousePool.ts` exports `WAREHOUSE_POOL_CUSTOMER_ID` — a real `customers` row (role `'customer'`, no `auth_id`, can't log in) representing unassigned/reusable empty totes, not a person. An empty tote's `customer_id` gets reassigned to it automatically the instant a driver picks it up (see `api/complete-route-stop`) — every tote's `customer_id` is a NOT NULL FK, so this is how "no longer belongs to that customer" is represented without a schema migration.

**Any new query that lists "all customers" or sums customer totals (MRR, counts, dropdowns) must add `.neq('id', WAREHOUSE_POOL_CUSTOMER_ID)`** — there's no RLS/schema-level way to exclude it automatically. Current call sites doing this: `admin/customers`, `admin/billing` (list + MRR), the route builder's customer dropdown.

Billing: only bill the $15/mo storage fee when a tote is both in a billed-storage status AND has real items — use `isBillableStorage()` from `lib/billing.ts`, never reimplement this check. It's already had to be fixed twice from two different hand-rolled copies (`calcMonthlyTotal` and the customer `/billing` page) that drifted apart.

## Force Complete Codes (driver errors)
- FC-001: Scanner hardware failure
- FC-002: Tote barcode unreadable/damaged
- FC-003: Seal barcode unreadable/damaged
- FC-004: App connectivity issue
- FC-005: Customer present, totes handed over directly
- FC-006: Time-critical, supervisor approved
- FC-007: Other

---

## Supabase Notes

### Tables (all in `public` schema)
`customers`, `totes`, `bins`, `routes`, `pick_lists`, `errors`, `regions`, `warehouses`, `locations`, `warehouse_rows`

### Regions (multi-region/franchise readiness)
`regions` holds one row per service area (currently just `lehigh-valley`). `customers`, `totes`, `bins`, `routes`, `pick_lists`, and `errors` all carry a `region_id uuid not null default get_default_region_id() references regions(id)` — existing insert code doesn't need to change while there's only one region. Schema defined in `schema.sql` Section 4.0; live-DB migration applied 2026-08-03. Region-based RLS enforcement (customers/staff scoped to their own region) is intentionally not built yet — trivial to add later, deferred until there's a second region.

### Warehouses & Locations (multi-warehouse readiness — ✅ migration APPLIED 2026-08-09)
Added 2026-08-09 ahead of Lehigh Valley operating a second physical building, per detailed user design decisions (see project memory for the full conversation). `warehouses` — one row per physical building (seeded with `WH1`, the current single warehouse), `code` is the prefix printed (smaller) on physical bin/zone labels. `locations` — warehouse-scoped, unlimited-per-warehouse, user-named drop zones and staging zones (`WH1-DZ-Dock`, `WH1-STG-02`), `type` enum `drop_zone | staging_zone`. `totes.current_location_id` (nullable FK to `locations`) is how a tote's current drop-zone/staging-zone is tracked — **totes deliberately do NOT get their own `warehouse_id`**; a tote's warehouse is always derived from whichever location currently holds it, never stored redundantly, so it can't go stale as totes move between buildings. `routes.warehouse_id` and `pick_lists.warehouse_id` are real columns now (both default to `WH1`) even though dispatch is single-hub today — cross-warehouse route consolidation is a real future need, explicitly deferred, not built.
Full DDL: `schema.sql` Sections 4.0.1/4.0.2 (main body) + the `✅ DONE` migration block near the bottom of the file (search for "warehouses + locations tables"). Migration applied live 2026-08-09; GRANTs verified via `information_schema.role_table_grants` (both tables show `SELECT`/`INSERT`/`UPDATE`/`DELETE` for `authenticated`).

### `bins.warehouse_id` (Phase 4 — ✅ migration applied and GRANT-verified live 2026-08-09)
Built 2026-08-09 once a second warehouse became imminent enough that the user asked for this ahead of schedule (originally this doc called it a separately-scheduled future phase — that changed same-day). Existing bin IDs (`A-12` etc.) are **not** renamed — that's a real physical relabeling event for WH1's already-printed labels, deliberately not forced by this migration. Going forward, only bins created for a non-default warehouse (any `code` other than `WH1`) get their id auto-prefixed with that warehouse's code (`WH2-A-12`) — enforced in `admin/warehouse-setup`'s create/drag-fill logic, not a DB constraint, since `bins.id` stays one global unique text PK (Postgres has no clean way to make it unique-per-warehouse while grandfathering in rows that predate the column).
`admin/warehouse-setup`'s Bin Layout section is now warehouse-scoped: the same warehouse selector used for Drop Zones/Staging Zones also filters which bins are shown/created.

**Warehouse-scoping of bin consumers — resolved 2026-08-09**, once WH2 (Bethlehem Annex) actually got created and the combined-pool gap started mattering for real:
- `pickLists.ts`'s `generatePickList()` now filters `pending_pick` totes to only those stored in a bin belonging to the target warehouse (bin lookup against `bins.warehouse_id`, since `totes.bin_location` is a free-text id, not itself warehouse-aware). A WH2 pick list can no longer include a tote sitting in a WH1 bin. `admin/pick-lists`' "Generate Pick List" button passes its warehouse filter through instead of always defaulting to WH1. Totes with no `bin_location` at all (a pre-existing, unrelated data-quality edge case) still land in every warehouse's "UNASSIGNED" bucket, unchanged — not touched by this fix.
- `warehouse/reports`' Bins tab now has its own warehouse selector (shown once >1 warehouse exists) and groups/totals only the filtered set — previously two warehouses sharing a row letter (e.g. both having a "Row A") would have visually merged in that table. Summary tab's combined bin-utilization stat is deliberately left alone, matching the rest of Summary's combined-by-default stats.
- `warehouse/scan-store`'s bin-scan step was evaluated and **left alone on purpose** — it's scan-only (no dropdown to mix warehouses), and since bin ids are globally unique (`A-12` vs `WH2-A-12`), a scan always resolves to the correct physical bin regardless of which building the worker is in. No correctness gap here. The only thing still missing is validating a scanned bin against "which warehouse is this worker currently in" — skipped for now per user's explicit call 2026-08-09, since that requires a design decision (manual per-session switcher vs. a home-warehouse field on staff accounts) that hasn't been made. Revisit only if this becomes a real problem.
Full DDL: `schema.sql`, search "bins.warehouse_id (Phase 4". Confirmed live via `information_schema.role_table_grants` and a zero-null backfill check on 2026-08-09 — safe to build against.

### Warehouse Floor Map (TODO #10 — ✅ fully live, both migrations applied and confirmed working end-to-end by the user 2026-08-09)
Built 2026-08-09 per the user's detailed spec — a visual floor-plan view under `admin/warehouse-setup`, as a new "Floor Map" tab alongside (not replacing) the existing list-based "Bin Layout" tab. User's confirmed design decisions:
- Bins/rows are still **created** via the existing "New Row" form, unchanged — the map is purely for arranging/visualizing what already exists, editing individual bin capacity by clicking, and placing zones. No draw-to-create-on-map.
- Whole **rows are freely draggable** to any position, and each row stores its **own real orientation** (`warehouse_rows.rotation`) — not all rows run the same direction on a real floor. This is why a new `warehouse_rows` table exists at all rather than adding columns to `bins`: position/orientation is a property of the row as a unit.
- **Two separate rotation mechanisms, not one**: a global "Rotate View" button, and each row's own persisted orientation. **Both are full 4-way (0°/90°/180°/270°), one 90° step per click** — not a horizontal/vertical toggle. Row rotation needed the full 4 values fixed 2026-08-09 after the user tried it live: 0° and 180° both look horizontal but read bin numbering in opposite directions (bin 1 on the left vs. bin 1 on the right), same for 90°/270° vertical — a real floor can need either, not just "which axis." Bin offsets go negative for 180°/270° (`WarehouseFloorMap`'s `binPositions` — e.g. bin *i* at `map_x - i` for a 180° row) — that's fine, the screen-space normalization step already shifts everything back to non-negative for rendering, so no special-casing was needed there. Dragging math accounts for the current VIEW rotation (`unrotateDelta` in the component) so dragging still feels natural no matter how the view is currently spun.
- **View rotation is persisted per warehouse** (`warehouses.map_view_rotation`, fixed 2026-08-09 after the user found it was resetting on every reload) — shared across whoever opens that warehouse's map, not a per-browser/per-operator setting, since it's treated as a fact about how that warehouse's map should be viewed. Loaded on mount, written on every rotate click.
- Individual bin capacity overrides reuse the exact interaction `warehouse/reports`' Bins tab already has (click → inline capacity field) — no new concept, just placed spatially instead of in a list. No schema change needed for this part (`bins.capacity` already existed).
- **One deliberate simplification from the original ask**: dropping a not-yet-placed zone onto the map for the first time is a "click to place" action (drops it at the map's origin), not a literal drag-from-a-tray — converting a raw pointer position into a canvas grid cell while accounting for scroll offset AND view rotation is real added complexity for a one-time action. Full drag-to-reposition (the actual "drag it around the floor" ask) works exactly as asked once a zone has an initial position.
New table `warehouse_rows` (`warehouse_id`, `row`, `map_x`, `map_y`, `rotation`), two new nullable columns on `locations` (`map_x`, `map_y`, null = "not yet placed"), and `warehouses.map_view_rotation` (not nullable, defaults to 0). All positions use integer **grid cells, not pixels** — matches the Excel-drag-to-fill metaphor Bin Layout already uses. New files: `src/lib/warehouseRows.ts` (fetch/upsert), `src/components/admin/WarehouseFloorMap.tsx` (the canvas itself).
Full DDL: `schema.sql`, search "warehouse_rows table + locations.map_x/map_y" and "warehouses.map_view_rotation" — both ✅ applied and GRANT-verified live 2026-08-09, and confirmed working end-to-end by the user the same day (drag/rotate rows, rotate+persist view, click-to-edit capacity, place a zone).

### RLS is enabled on all tables.
- Customers see only their own data
- Drivers see their own routes
- Warehouse/sorter/admin have broader access
- `get_my_role()` helper function avoids RLS recursion

### ✅ Supabase GRANTs — COMPLETED May 29, 2026
Explicit GRANTs were added for all tables on May 29, 2026. No further action needed before the October 30, 2026 deadline.

```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.customers   to authenticated;
grant select, insert, update, delete on public.totes       to authenticated;
grant select, insert, update, delete on public.bins        to authenticated;
grant select, insert, update, delete on public.routes      to authenticated;
grant select, insert, update, delete on public.pick_lists  to authenticated;
grant select, insert, update, delete on public.errors      to authenticated;
```

**⚠️ Gap found 2026-08-08: `tote_requests` was never in this list.** Confirmed as the likely cause of a real bug — the driver's browser client updating `tote_requests` directly (to mark a pickup order complete) was a silent no-op, since `.update()` doesn't throw on an RLS/grant refusal and nothing was checking the returned error. Worked around by routing that specific write through a service-role API route (`api/complete-route-stop`) instead of patching the grant, since the exact live policy/grant on this table is undocumented and unverified (it predates this GRANTs block — see the "✅ Done" note under Migrations below). If another direct client write to `tote_requests` ever needs building (e.g. a customer canceling their own request), don't assume it'll just work — either verify the live grant first, or route it server-side the same way. Running this would close the gap at the root if ever confirmed safe to add:
```sql
grant select, insert, update, delete on public.tote_requests to authenticated;
```

Any new table you create also needs a matching GRANT or supabase-js won't see it.

**`warehouses` and `locations` (added 2026-08-09, ⏳ pending)** — the GRANT statements are included directly in the migration block (`schema.sql`, search "warehouses + locations tables") this time, not left to a separate doc-only step, precisely to avoid repeating the `tote_requests` gap above. Still: **verify live** via `information_schema.role_table_grants` after the user runs the migration (the migration block itself includes this exact query) — don't take it on faith just because it's in the SQL this time either.

### Migrations (schema.sql updated May 29, 2026 to match — see file for full history)
- ✅ `warehouse_rows` table + `locations.map_x`/`map_y` (Warehouse Floor Map, TODO #10). Added and applied 2026-08-09. See the "Warehouse Floor Map" section above.
- ✅ `bins.warehouse_id` (Phase 4 of multi-warehouse readiness). Added and applied 2026-08-09. See the `bins.warehouse_id` section above.
- ✅ `warehouses` + `locations` tables, `totes.current_location_id`, `routes.warehouse_id`, `pick_lists.warehouse_id` (multi-warehouse readiness). Added and applied 2026-08-09. See the Warehouses & Locations section above.
- ✅ `regions` table + `region_id` on all tables (multi-region/franchise readiness). Applied 2026-08-03.
- ✅ `totes.empty_since` — already live
- ✅ `totes.pickup_requested` — already live
- ✅ `tote_requests` table — already live (also has an `admin_notes` column not previously documented)
- ✅ `route_status` enum: `returning` value — applied 2026-07-27
- ✅ `tote_requests.type` constraint simplified to 3 values, decided and applied 2026-08-05 (user ran the migration SQL in the Supabase dashboard, confirmed via `pg_get_constraintdef`). App code (`my-items/page.tsx`, `dashboard/page.tsx`, `admin/requests/page.tsx`) and live constraint now both agree: `'empty_tote_delivery' | 'pickup' | 'full_tote_delivery'`. `'empty_tote_return'` retired (folded into `'pickup'` — full vs. empty now derived live from each tote's current item count, not stored). `'tote_return'` renamed `'full_tote_delivery'` (clearer direction — delivered back TO the customer).
  Background: found while building the admin Orders concept mockup — `schema.sql`'s documented constraint only ever listed `('empty_tote_delivery', 'pickup')`, but app code had already drifted to insert 2 more undocumented types, with unchecked insert errors on all three calls (also fixed now — see `my-items/page.tsx`). If the live constraint really matched the stale documentation, "Return This Tote to Storage Valet" and "Request This Tote Back" may have been silently failing in production. Worth confirming the actual current live constraint before/while running the above.

### Free Tier Warning
Project is on Supabase free tier (pre-revenue). Auto-pauses after 7 days inactivity.
Fix: cron-job.org pinging `/api/health` every 5 days, or upgrade to Pro when live.

---

## Stripe
Monthly subscription billing per tote. `billing.ts` handles charge logic. Stripe webhooks live at `api/stripe/`.

## Twilio
SMS notifications to customers via `api/send-sms/`.

## AI Labeling
Claude API suggests item names from tote photos. Lives at `api/ai-label/`. Uses `claude-sonnet-5`.

---

## Storage Buckets (Supabase)
- `tote-photos` — **actually private** (verified against live project 2026-08-04, corrected from this doc's previous "public read" note, which was wrong). Photos are accessed via short-lived signed URLs (`createSignedUrl`, 1hr expiry) — see `my-items/page.tsx` and `add-items/page.tsx`. Do not use `getPublicUrl()` on this bucket, it will silently produce broken image URLs.
- `seal-photos`, `invoice-pdfs` — **do not exist yet** on the live project (verified 2026-08-04). No code references them either, so nothing is currently broken by their absence — this was aspirational/planned documentation that never got built. Create them (and decide public vs. private + RLS) before writing any code that uses them.

---

## Roadmap
- **Native Android app (Play Store)** — planned, not yet started. Today Tote Valet is a Next.js web app on Vercel with no native wrapper (e.g. Capacitor) in the codebase. This was previously discussed with the user but hadn't made it into this doc — flagged 2026-08-05 when the gap surfaced. Notable side benefit: a native app would very likely reduce/eliminate TODO #14 below (intermittent Google OAuth PKCE cookie failure), since native OAuth flows use a system-browser-tab + deep-link-back pattern instead of a same-origin cookie surviving a full page redirect round trip — but going native is a real rebuild, not a quick fix, and isn't scoped/timed yet.

---

## Project Status (2026-08-05)
**Customer portal considered feature-complete** per user — as far as it can go until they're ready to go live, targeted **~1-2 weeks out** from 2026-08-05. Remaining open items on the customer side (TODO #11 final verification, #14 OAuth bug, #6/#5 landing polish, #12 training video) are known and tracked below, not blockers to this call — user's explicit read is there's nothing left worth doing on the customer portal *right now*.

**Work is moving to admin and warehouse/operations screens next.** See Portals & Pages above for what's already scoped there (Admin: Dashboard, Customers, Staff, Routes, Totes, Requests, Monitor, Billing, Settings, Errors; Warehouse: Dashboard, Scan & Store, Sort, Pick Lists, Reports) and TODOs #1-3 and #10 below for known gaps in that area.

---

## Known Outstanding TODOs
1. ~~Warehouse portal — Add "Sort" under Quick Actions~~ ✅ Done 2026-08-06 — "Sort" button added to Warehouse dashboard Quick Actions (links to `/warehouse/sort`), plus a purple alert banner when totes are waiting to be sorted.
2. ~~Warehouse portal — Add "Sort" under Reports~~ ✅ Done 2026-08-06 — Reports > Summary tab now shows "In Drop Zone (Unsorted)" and "Sorted Today" alongside the existing stats.
3. ~~Warehouse portal — Add Live Inventory "unsorted" view~~ ✅ Done 2026-08-06 — "Unsorted — In Drop Zone" tile added to the Warehouse dashboard's Live Inventory grid (`status = 'picked'` count, i.e. totes picked but not yet routed to a zone).
4. ~~Landing page — Video walkthrough (currently "Coming Soon")~~ ✅ Replaced 2026-07-28 with `src/components/ui/ExplainerAnimation.tsx` — a 5-scene animated CSS/SVG loop (sign in → pick date/quantity → fill & label → request pickup → search & request dropoff). Known to need further polish/iteration later — revisit pacing, scene content, and consider adding real screenshots or a narrated version once the flow is more final.
5. Landing page — Dedicated pricing page (currently links to /register)
6. Landing page — Verify FAQ answers are populated
7. ~~Run Supabase GRANTs before October 30, 2026~~ ✅ Done May 29, 2026
8. ~~Decide on and run pending schema migrations when ready~~ ✅ Done — all four confirmed/applied 2026-07-27 (see Migrations section above)
9. **LOW PRIORITY (downgraded 2026-08-05, per user)** — AI photo labeling (`api/ai-label/`) — code is wired up and working (2026-07-27), but Anthropic account has no credit balance so it's effectively off. Add credits at console.anthropic.com when ready, OR evaluate a free on-device fallback (e.g. TensorFlow.js COCO-SSD in-browser) — tradeoff: free but much coarser generic labels vs. Claude's specific ones. **User's explicit call: don't revisit until they're ready to pay for it — likely not until well after the native app ships and there's real cash flow. Do not pick this up proactively.**
10. ~~Warehouse Editor~~ ✅ **Fully built, migrated, and confirmed live 2026-08-09** as **Floor Map**, a new tab in `admin/warehouse-setup` alongside the existing list-based "Bin Layout" tab (kept, not replaced — user's explicit call). Full design + schema in the "Warehouse Floor Map" section below. First live test the same day found two real gaps (row rotation was only a horizontal/vertical toggle instead of full 4-way; view rotation wasn't persisting across reloads) — both fixed and re-verified live same day, user confirmed "works exactly as needed." Drag-and-drop, row rotation (all 4 positions), view rotation + persistence, and click-to-edit bin capacity all confirmed working.
11. ~~Edit Totes (customer-facing)~~ ✅ Built 2026-08-04 (pushed `2d07883`, corrected `f2b32c4`). New `/edit-tote` page + "Edit a Tote" dashboard button. Not yet tested by user on a live device — treat as awaiting confirmation, not fully done, until they've tried it. **User's read 2026-08-09: thinks it's close to ready for customers to actually use** — still not a confirmed live-device test, just an updated impression; don't mark this fully done until they've actually tried it end to end. Spec as agreed:
    - Editable only while a tote's `status = 'empty_at_customer'` (covers both an actually-empty tote and one the customer has since filled but not yet requested pickup for — same DB status either way). Once it leaves that status, **contents become read-only** — the only way to edit again is to request the tote be returned (reuse the existing return-request flow in `my-items`, no new staff-approval system needed).
    - **Tote nickname (`tote_name`) stays editable at all times**, regardless of status — renaming has no bearing on warehouse-side truth.
    - Editable: item list (add/rename/remove any item, not just newly-added ones — broader than the existing remove-only "inventory confirmation" flow in `my-items`), photos (add/**delete** — no delete-existing-photo UI exists today, and there's no way to free up space once at the `MAX_PHOTOS` cap of 5).
    - **No self-serve tote deletion/retirement.** Customers are billed per tote in their possession; letting them unilaterally remove an empty tote from their account while physically keeping it would let them dodge billing. Retirement only happens naturally through the existing empty-tote pickup flow.
    - **Merge/split totes — explicitly out of scope.** Customer inventory isn't scanned/verified, so this adds complexity/training overhead without enough payoff; deliberately kept simple.
    - AI-labeled items should get an explicit "Accept" action (not just silent accept-by-default) with the label still overwritable inline — refines the existing `ai_generated`/✨ pattern from Add Items.
    - Edit history — worth having later (would have made the 2026-08-04 photo-overwrite bug obvious immediately), not required for v1.
    - **Entry point decided 2026-08-04: a new "Edit a Tote" button on the customer dashboard, placed under the existing "+ Add Items to Tote" button** — not a mode inside the Add Items screen as originally floated. Opens a new dedicated page/route reusing the same tote-scan-first *pattern* (scan → look up → show current state), not the literal Add Items screen itself.
    - **Item editing UX: direct inline editing** — text field + X per item, matching the pattern already used in Add Items (not the separate multi-select "remove mode" that exists in My Items).
    - **Read-only totes (any status other than `empty_at_customer`): quietly hide edit controls, no extra lock/banner messaging** — same info shown, just without X buttons / add controls. Rely on the FAQ, not in-app messaging, to explain why.
    - **AI "Accept" pattern retrofit applies to both Add Items and Edit Totes**, for consistency, per user's explicit call.
    - **FAQ entry written 2026-08-04 (pushed `9f567e3`), ahead of the feature shipping** — added to both `src/app/landing/page.tsx` (public) and `src/app/(customer)/help/page.tsx` (post-login, reachable via the top-right hamburger → Help & Support). Explains: contents editable while at home, read-only once picked up, request a return to edit again; renaming always allowed regardless of status.
    - **Implementation notes:** `schema.sql` only documents a customer **read** RLS policy on `totes` (`totes_owner_read`) — no documented policy permits customer insert/update, yet Add Items demonstrably writes successfully, meaning the live database has an undocumented write policy of unknown scope (consistent with today's other doc-vs-reality gaps — Next.js version, storage bucket visibility). Since Edit Totes does full overwrites/deletes (unlike Add Items' append-only writes), didn't rely on RLS alone: both the lookup and the save explicitly filter on `customer_id` in the query itself as a hard guardrail. **Worth having someone check the actual live RLS policy on `totes` in the Supabase dashboard and syncing schema.sql to match**, same as was done for storage buckets — not done yet, not blocking.
    - Deleting an existing photo also removes the file from storage (`supabase.storage.from('tote-photos').remove()`), not just the DB reference — avoids orphaned files, extending the same discipline as the photo-overwrite fix earlier today.
    - Reuse: new shared `src/components/ui/ToteItemRow.tsx` (item-row UI incl. the AI Accept state) and `src/lib/aiLabel.ts` (AI photo-detect fetch logic) — both used identically by Add Items and Edit Totes instead of duplicated code, first concrete application of TODO #13 below.
    - **Confirmation review added 2026-08-04 (pushed `e67c5e3`), per user request** — a final "does this actually match what's physically in the tote" checkpoint before saving. New shared `src/components/ui/ToteConfirmReview.tsx` (tote name + full item list + photos, "Yes, This Is Accurate" / "Go Back & Edit"), applied to **both** Add Items and Edit Totes per user's explicit call, not just Edit Totes. In Edit Totes it's skipped for a name-only change (nothing physical to confirm when the tote isn't `empty_at_customer`) — saves directly in that case.
    - **"Empty Tote / Delete All Inventory" button added 2026-08-04 (pushed `10459a0`)**, near the top of the item list, with an inline warning + confirm/cancel before it clears the list (still goes through the confirm-review screen before actually saving). Building this surfaced a wrong assumption from the original build: I'd required at least one item to save a tote, but `empty_at_customer` legitimately covers genuinely empty totes too — removed that block (both the Continue-button check and the one inside `handleSave`) and removed the "keep at least one row" guard on individual item removal for consistency. `ToteConfirmReview` now shows "This tote will be saved as empty." instead of a bare "Items (0)" when applicable.
12. **NEW (2026-08-04) — Longer sign-up training video.** Not yet scoped/designed. The existing 30-second `ExplainerAnimation.tsx` walkthrough (TODO #4 above) isn't enough for some users. Needs a separate, longer instructional video covering all features, shown during sign-up. Requirements per user:
    - State the video's length up front (e.g. "This video is X minutes long") so users know what they're committing to before starting.
    - Bookmarked/chaptered by feature so users can jump to the part they need instead of watching straight through.
    - Available afterward for reference too — not just a one-time sign-up thing. Add it to the Help & Support section (`src/app/(customer)/help/page.tsx`, reachable via the top-right hamburger menu) so users can rewatch it any time.
    - Relationship to the existing 30-second animation not yet decided — could coexist (quick teaser + optional deep-dive) or replace it. Not decided, ask user when scoping this properly.
13. **Consistency/reuse audit across customer process paths.** User wants all customer-facing flows (Add Items, My Items, Edit Totes, pickup/return, etc.) reviewed for reuse opportunities — as similar in programming (shared components) and layout (visual consistency) as possible, rather than each flow reinventing its own version of the same UI patterns. **First real pass done 2026-08-05** across all 10 customer-portal pages. Findings and what got fixed:
    - **Photo grid — the one genuine UX bug found, not just code duplication.** My Items let you tap a tote photo to view it full-screen; Edit Totes and Add Items showed the same-looking photo grid but tapping did nothing, since all three hand-rolled their own `<img>` markup independently. Fixed by extracting `src/components/ui/PhotoThumb.tsx` (single tile — size, tap-to-expand, delete-X, uploading-spinner states), `src/components/ui/PhotoLightbox.tsx` (full-screen viewer), and `src/components/ui/PhotoGrid.tsx` (renders a row of thumbs + manages its own lightbox state). Wired into Add Items, Edit Totes, My Items (both its main gallery and its inventory-confirm gallery), and `ToteConfirmReview` — all four now behave identically, and Add Items/Edit Totes gained tap-to-expand for free.
    - **Selectable tote row — duplicated 3x within My Items alone** (pickup-for-storage, return-empty-totes, return-stored-totes sub-flows each hand-rolled the same "card + emoji + name + subtitle + checkmark" button). Extracted to `src/components/ui/SelectableToteRow.tsx`. Also normalized one inconsistency found along the way: the stored-totes row always said "items" (no singular check) while the other two correctly singularized — now consistent.
    - **Back button** — identical className hand-copied 6-8x across Add Items, Edit Totes, My Items, Billing, Profile, Request Totes. Extracted to `src/components/ui/BackButton.tsx` (`onClick` + optional `label`, defaults to "Back").
    - **Alert banner** (error/success inline messages) — identical className hand-copied 6+ times across the same set of pages. Extracted to `src/components/ui/AlertBanner.tsx` (`variant`: error/success/warning, plus a `className` passthrough for layout modifiers like `flex items-center gap-2`). Note: the two amber "photo limit reached" messages in Add Items/Edit Totes were deliberately **not** migrated to this — their padding (`py-2.5` + `text-center`) differs slightly from the shared base (`py-3`), and stacking conflicting Tailwind padding utilities via a `className` override is fragile (resolution order depends on Tailwind's generated CSS order, not source order) — not worth the risk for a ~2px difference. Left as-is.
    - **Loading skeleton bars** — identical `bg-gray-200 animate-pulse` base hand-copied 8+ times across Dashboard, Billing, My Items, Notifications, Profile, Edit Totes, with varying sizes. Extracted to `src/components/ui/LoadingSkeleton.tsx` (`SkeletonBlock` for one bar, `SkeletonList` for a repeated row/column) — sizing stays caller-controlled via `className`/`itemClassName`, only the pulse styling is centralized.
    - **Deliberately left alone:** two richer "info card" patterns in Add Items (tote-ID-captured / tote-found confirmations) — different padding per element (`py-3` vs `py-4`) and multi-color text, not true duplicates of the plain alert banner; forcing them through `AlertBanner` would've been a real (if tiny) visual change nobody asked for.
    - **Not yet covered by this pass:** the same Back button / alert banner duplication also exists on the auth pages (login, register, forgot-password, reset-password) — outside "customer portal" scope as originally framed, but same easy win whenever that's in scope. Also not covered: Menu, Help pages (neither had matching duplicate patterns to extract).
14. ~~Intermittent "PKCE code verifier not found in storage" error on Google OAuth login~~ **SUPERSEDED 2026-08-08 — root cause found and the underlying mechanism removed, not just patched.** This had progressed from "intermittent" to total lockout: both Google and email/password login failing on every device, always bouncing back to `/landing`. Diagnosed live via DevTools (not guessed): the server-side OAuth exchange was genuinely succeeding every time (Supabase's own `last_sign_in_at` updated on each attempt), but `src/lib/supabase/client.ts`'s hybrid cookie/localStorage adapter — the same one flagged below as "iterated on repeatedly" — was splitting large sessions across multiple real cookie chunks (Supabase's own chunking for oversized tokens) and only syncing **one** chunk into localStorage. With a chunk missing, the client could never reconstruct a valid session, so every check saw "not logged in." Confirmed directly: two real `sb-*-auth-token` cookies existed (3216 + 1599 bytes) but `tv-session` in localStorage held only one entry.
    Fixed by removing the custom cookie adapter entirely (pushed `34fd4b2`) — `createBrowserClient` now uses `@supabase/ssr`'s own default cookie handling instead of the hand-rolled one. Trade-off accepted by user: sessions may no longer survive a browser fully clearing cookies on exit (the original reason the hybrid was built), but that's narrower than total login failure. If cookie-clear-on-exit resilience is needed again later, don't reach for the same hybrid-with-manual-chunk-sync approach — it's now confirmed to have a real correctness bug in exactly the scenario (multi-chunk sessions) it needed to handle.
15. **⚠️ ACTIVE, NEEDS REVERTING — Minimum order/delivery lead time temporarily removed for trials (2026-08-08, user's explicit request).** All 4 customer preferred-date pickers (Request Totes' empty-tote-delivery date; My Items' Request Pickup, Return Empty Totes, and Request Stored Totes Back dates) normally enforce a 24hr minimum lead time (`min` = tomorrow). Relaxed to `min` = today (`MIN_PREFERRED_DATE` const in each file) so the user can place an order and walk it through pickup/delivery same-day while testing. **Revert by restoring `min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}` (or reintroducing the `MIN_PREFERRED_DATE` const with that expression) in `src/app/(customer)/request-totes/page.tsx` and `src/app/(customer)/my-items/page.tsx` once trials are done** — ask the user when to do this, don't revert proactively. **Reconfirmed 2026-08-09: still in trials, stays relaxed — do not revert.**
16. **Manual "Add Stop" route builder doesn't link to an existing pending order.** Only stops that originate from Orders' "Assign to New Route" button carry an `order_ref` (see RouteStop in database.ts) — a stop typed in by hand via `/admin/routes/new`'s Add Stop form never does, even if it happens to be for a customer who already has a matching pending order. Result: the route delivers/completes fine, but the order sits on Pending forever since nothing ever tells it the delivery happened (found + one-off-fixed for Kristin Dudish's empty-tote order, `tote_requests` id `34cc50dc-6b65-485f-a7fb-b226280c2f1c`, 2026-08-08). **Proposed fix, not yet built — user said "not now" 2026-08-08 when offered:** show a customer's pending orders when selected in Add Stop, let the admin pull one in (auto-fills quantity/totes + sets order_ref) instead of typing blind. Revisit if this recurs or the user asks.
17. **NEW (2026-08-09) — Multi-warehouse: Scan & Store worker-warehouse validation, not built.** Full context lives in the "Warehouses & Locations" / "`bins.warehouse_id`" sections above (schema, pick-list scoping, and Reports' Bins tab filter are all ✅ done as of this date, including a real second warehouse — WH2 "Bethlehem Annex" — now live and tested). The one piece explicitly evaluated and deferred: `warehouse/scan-store`'s bin-scan step still doesn't validate that a scanned bin belongs to the warehouse the worker is actually standing in. Not currently a correctness bug (bin ids are globally unique — `A-12` vs `WH2-A-12` — so a scan always resolves to the right physical bin regardless), just a missing human-error guardrail. **User's explicit call 2026-08-09: skip for now**, only build once it's a real day-to-day problem. If picked up later, it needs one open design decision made first: does the app get a manual per-session warehouse switcher on Scan & Store (like `admin/sort` has), or does each staff account get a persistent home-warehouse field? Not decided — ask the user then, don't assume.
    Also added this session: a **Warehouse Reports** shortcut link in the admin sidebar's new "Other Portals" group (`src/components/admin/Sidebar.tsx`) jumping to `/warehouse/reports`, since admin's own portal has no other path there.
