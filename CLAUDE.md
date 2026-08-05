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
- `tote-photos` — **actually private** (verified against live project 2026-08-04, corrected from this doc's previous "public read" note, which was wrong). Photos are accessed via short-lived signed URLs (`createSignedUrl`, 1hr expiry) — see `my-items/page.tsx` and `add-items/page.tsx`. Do not use `getPublicUrl()` on this bucket, it will silently produce broken image URLs.
- `seal-photos`, `invoice-pdfs` — **do not exist yet** on the live project (verified 2026-08-04). No code references them either, so nothing is currently broken by their absence — this was aspirational/planned documentation that never got built. Create them (and decide public vs. private + RLS) before writing any code that uses them.

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
10. **NEW (2026-08-04) — Warehouse Editor.** Admin-only tool for visually mapping the warehouse: a layout/map view of bins for easy labeling. Modeled on Excel's drag-to-fill behavior — dragging down a cell auto-increments the label sequence (e.g. Row 1, Bin 1, Shelf 1 → 1A, 1B, 1C, 1D, 1E, then Row 2, Bin 1, Shelf 1...). Not yet scoped/designed — just captured from user's description, no implementation details decided.
11. ~~Edit Totes (customer-facing)~~ ✅ Built 2026-08-04 (pushed `2d07883`, corrected `f2b32c4`). New `/edit-tote` page + "Edit a Tote" dashboard button. Not yet tested by user on a live device — treat as awaiting confirmation, not fully done, until they've tried it. Spec as agreed:
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
13. **NEW (2026-08-04) — Consistency/reuse audit across customer process paths.** User wants all customer-facing flows (Add Items, My Items, Edit Totes once built, pickup/return, etc.) reviewed for reuse opportunities — as similar in programming (shared components) and layout (visual consistency) as possible, rather than each flow reinventing its own version of the same UI patterns. Not started. First concrete application of this: Edit Totes (TODO #11) will share an item-row component with Add Items rather than duplicating that JSX — a natural first test case once built.
14. **NEW (2026-08-05) — Intermittent "PKCE code verifier not found in storage" error on Google OAuth login.** User hit this while testing on their phone (mobile Chrome). Confirmed real, not a fluke: an intermittent race where the browser doesn't reliably carry the PKCE code-verifier cookie through the redirect round-trip to Google and back, so `/callback`'s `exchangeCodeForSession` fails server-side and bounces to `/login?error=<raw SDK message>` — which the user then sees verbatim, unstyled, technical. Scope: **Google sign-in only** — email/password login (a separate code path) is unaffected and is the reliable fallback in the meantime. Not "broken," just flaky — most Google sign-in attempts succeed, and retrying usually recovers it. Git history (`e907c5c`, `11feca5`, `32dbd5c`, `0395404`, `6a4173d`, `a3a2753`, `69d6583`, and others) shows this general area (`src/lib/supabase/client.ts`'s hybrid cookie/localStorage storage adapter, built to survive Chrome's "clear cookies on exit" setting while still letting the server read the PKCE verifier) has been iterated on repeatedly — worth reading that history before attempting another fix, to avoid re-trying an approach already found insufficient. Two independent angles worth considering when this gets picked up: (1) actually reduce the intermittency (root cause not yet nailed down — leading theory is Chrome mobile evicting/not-yet-flushing the verifier cookie before the cross-site redirect completes), and (2) regardless of (1), the failure-mode UX itself is bad — a paying customer would currently see a raw SDK error string with no recovery action; `/login`'s `error` query-param handling (`src/app/(auth)/login/page.tsx`) should at minimum show a plain-language message with a one-tap retry instead. Not started on either front.
