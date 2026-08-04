# Tote Valet — Claude Code Context
*Drop this file in your repo root. Claude Code reads it automatically every session.*
*Last updated: May 2026*

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
`customers`, `totes`, `bins`, `routes`, `pick_lists`, `errors`, `regions`

### Regions (multi-region/franchise readiness)
`regions` holds one row per service area (currently just `lehigh-valley`). `customers`, `totes`, `bins`, `routes`, `pick_lists`, and `errors` all carry a `region_id uuid not null default get_default_region_id() references regions(id)` — existing insert code doesn't need to change while there's only one region. Schema defined in `schema.sql` Section 4.0; live-DB migration applied 2026-08-03. Region-based RLS enforcement (customers/staff scoped to their own region) is intentionally not built yet — trivial to add later, deferred until there's a second region.

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

Any new table you create also needs a matching GRANT or supabase-js won't see it.

### Migrations (schema.sql updated May 29, 2026 to match — see file for full history)
- ✅ `regions` table + `region_id` on all tables (multi-region/franchise readiness). Applied 2026-08-03.
- ✅ `totes.empty_since` — already live
- ✅ `totes.pickup_requested` — already live
- ✅ `tote_requests` table — already live (also has an `admin_notes` column not previously documented)
- ✅ `route_status` enum: `returning` value — applied 2026-07-27

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
- `tote-photos` — public read, authenticated write
- `seal-photos` — public read, authenticated write
- `invoice-pdfs` — private, authenticated read

---

## Known Outstanding TODOs
1. Warehouse portal — Add "Sort" under Quick Actions
2. Warehouse portal — Add "Sort" under Reports
3. Warehouse portal — Add Live Inventory "unsorted" view
4. ~~Landing page — Video walkthrough (currently "Coming Soon")~~ ✅ Replaced 2026-07-28 with `src/components/ui/ExplainerAnimation.tsx` — a 5-scene animated CSS/SVG loop (sign in → pick date/quantity → fill & label → request pickup → search & request dropoff). Known to need further polish/iteration later — revisit pacing, scene content, and consider adding real screenshots or a narrated version once the flow is more final.
5. Landing page — Dedicated pricing page (currently links to /register)
6. Landing page — Verify FAQ answers are populated
7. ~~Run Supabase GRANTs before October 30, 2026~~ ✅ Done May 29, 2026
8. ~~Decide on and run pending schema migrations when ready~~ ✅ Done — all four confirmed/applied 2026-07-27 (see Migrations section above)
9. AI photo labeling (`api/ai-label/`) — code is wired up and working (2026-07-27), but Anthropic account has no credit balance so it's effectively off. Add credits at console.anthropic.com when ready, OR evaluate a free on-device fallback (e.g. TensorFlow.js COCO-SSD in-browser) — tradeoff: free but much coarser generic labels vs. Claude's specific ones.
