-- ============================================================
-- TOTE VALET — Supabase Database Schema
-- Section 4 of App Specification
-- Run this in your Supabase SQL editor to initialize the DB
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum (
  'customer',
  'driver',
  'warehouse',
  'sorter',
  'admin'
);

create type account_status as enum (
  'active',
  'suspended',
  'failed_payment'
);

create type tote_status as enum (
  'empty_at_customer',
  'in_transit',
  'ready_to_stow',
  'stored',
  'pending_pick',
  'picked',
  'returned_to_station',
  'error'
);

create type route_status as enum (
  'planned',
  'in_progress',
  'complete',
  'returning'
);

create type pick_list_status as enum (
  'ready',
  'in_progress',
  'complete'
);

create type error_type as enum (
  'seal_mismatch',
  'force_complete',
  'partial_delivery',
  'unexpected_tote'
);

-- ============================================================
-- SECTION 4.0 — REGIONS TABLE
-- One row per service area (Lehigh Valley today, more as we
-- expand/franchise). Every customer/tote/bin/route/etc. row
-- carries a region_id so queries can filter to a single region
-- and RLS can eventually enforce it at the DB level.
-- ============================================================

create table regions (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,               -- e.g. "Lehigh Valley"
  slug        text not null unique,        -- e.g. "lehigh-valley"
  created_at  timestamptz not null default now()
);

insert into regions (name, slug) values ('Lehigh Valley', 'lehigh-valley');

-- Returns the current default region's id. Used as the column
-- default below so existing insert code doesn't need to change
-- while there's only one region.
create or replace function get_default_region_id()
returns uuid
language sql
stable
as $$
  select id from regions where slug = 'lehigh-valley' limit 1;
$$;

-- ============================================================
-- SECTION 4.0.1 — WAREHOUSES TABLE
-- One row per physical building within a region. Lehigh Valley
-- today operates from one (WH1); multi-warehouse readiness added
-- 2026-08-09 ahead of a second building actually going live.
-- `code` (e.g. "WH1") is the prefix printed on physical bin/zone
-- labels — smaller than the rest of the label text, but part of
-- the real scannable ID. See Section 4.0.2 (locations) for how
-- drop zones/staging zones use it; `bins` is NOT warehouse-scoped
-- yet (deferred — see schema.sql migrations section for why).
-- ============================================================

create table warehouses (
  id          uuid primary key default uuid_generate_v4(),
  region_id   uuid not null references regions(id),
  name        text not null,               -- e.g. "Coopersburg Main"
  code        text not null unique,        -- e.g. "WH1" — physical-label prefix
  address     text,
  created_at  timestamptz not null default now()
);

insert into warehouses (region_id, name, code)
  select id, 'Coopersburg Main', 'WH1' from regions where slug = 'lehigh-valley';

create index idx_warehouses_region_id on warehouses(region_id);

-- Returns the current default warehouse's id. Used as the column
-- default below so existing insert code doesn't need to change
-- while there's only one warehouse.
create or replace function get_default_warehouse_id()
returns uuid
language sql
stable
as $$
  select id from warehouses where code = 'WH1' limit 1;
$$;

-- ============================================================
-- SECTION 4.0.2 — LOCATIONS TABLE
-- Warehouse-scoped drop zones and staging zones — informal floor
-- spots (not physically sized, unlike bins), unlimited per
-- warehouse, user-named (e.g. "WH1-DZ-Dock", "WH1-STG-02"). A
-- tote references whichever location currently holds it via
-- totes.current_location_id (Section 4.2) — never its own
-- warehouse_id — so its warehouse is always derived from its
-- current parent location, not stored redundantly. `bins` is
-- deliberately NOT folded into this table yet (see migrations
-- section for the additive-vs-unify tradeoff).
-- ============================================================

create type location_type as enum ('drop_zone', 'staging_zone');

create table locations (
  id            uuid primary key default uuid_generate_v4(),
  warehouse_id  uuid not null references warehouses(id),
  type          location_type not null,
  code          text not null,             -- e.g. WH1-DZ-Dock, WH1-STG-02
  notes         text,
  created_at    timestamptz not null default now(),
  unique (warehouse_id, code)
);

create index idx_locations_warehouse_id on locations(warehouse_id);
create index idx_locations_type on locations(type);

-- ============================================================
-- SECTION 4.1 — CUSTOMERS TABLE
-- ============================================================

create table customers (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  email           text not null unique,
  phone           text,
  address         text,
  card_on_file    text,                          -- Stripe payment method ID
  monthly_total   decimal(10, 2) default 0,      -- Computed from active totes
  status          account_status not null default 'active',
  role            user_role not null default 'customer',
  free_exchanges_used int not null default 0,    -- Resets annually
  joined_date     date not null default current_date,
  notes           text,                          -- Admin notes field
  region_id       uuid not null default get_default_region_id() references regions(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Link to Supabase Auth (one customer row per auth user)
alter table customers add column auth_id uuid unique references auth.users(id) on delete cascade;

create index idx_customers_email on customers(email);
create index idx_customers_auth_id on customers(auth_id);
create index idx_customers_status on customers(status);
create index idx_customers_region_id on customers(region_id);

-- ============================================================
-- SECTION 4.2 — TOTES TABLE
-- ============================================================

create table totes (
  id              text primary key,               -- e.g. TV-0031, pre-printed barcode
  customer_id     uuid not null references customers(id) on delete restrict,
  tote_name       text,                           -- Customer-assigned nickname
  seal_number     text,                           -- e.g. SL-4831, plastic security seal
  photo_url       text,                           -- Supabase storage URL of sealed tote photo
  status          tote_status not null default 'empty_at_customer',
  bin_location    text,                           -- e.g. A-12, null if not stored
  -- Set only while a tote sits in a drop zone or staging zone (Section
  -- 4.0.2) — null while in a real bin (bin_location, above), with a
  -- customer, or in transit. Deliberately NOT a warehouse_id: the tote's
  -- warehouse is always derived by joining through here, never stored
  -- redundantly, so it can't go stale as totes move between warehouses.
  current_location_id uuid references locations(id) on delete set null,
  last_scan_date  timestamptz,
  items           jsonb default '[]'::jsonb,      -- Array of { label, photo_url?, ai_generated? }
  region_id       uuid not null default get_default_region_id() references regions(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_totes_customer_id on totes(customer_id);
create index idx_totes_status on totes(status);
create index idx_totes_bin_location on totes(bin_location);
create index idx_totes_seal_number on totes(seal_number);
create index idx_totes_region_id on totes(region_id);
create index idx_totes_current_location_id on totes(current_location_id);

-- ============================================================
-- SECTION 4.3 — BINS TABLE
-- ============================================================

create table bins (
  id              text primary key,               -- e.g. A-12
  row             char(1) not null,               -- e.g. A, B, C for pick list optimization
  capacity        int not null default 10,        -- Max totes
  current_count   int not null default 0,         -- Computed from totes table
  notes           text,                           -- Admin notes
  region_id       uuid not null default get_default_region_id() references regions(id)
);

create index idx_bins_row on bins(row);
create index idx_bins_region_id on bins(region_id);

-- ============================================================
-- SECTION 4.4 — ROUTES TABLE
-- ============================================================

create table routes (
  id                    text primary key,          -- e.g. RT-001
  driver_id             uuid references customers(id) on delete restrict,
  date                  date not null,
  status                route_status not null default 'planned',
  stops                 jsonb not null default '[]'::jsonb,
  -- Each stop: { stop_number, customer_id, customer_name, address, type: 'pickup'|'delivery',
  --              tote_ids[], notes, completed, force_completed, error_id }
  completed_at          timestamptz,
  force_complete_count  int not null default 0,    -- For admin reporting
  error_count           int not null default 0,    -- Total errors on this route
  region_id             uuid not null default get_default_region_id() references regions(id),
  -- Which warehouse this route dispatches from. Real column now, even
  -- though dispatch is single-hub today — cross-warehouse route
  -- consolidation (combine a WH1 + WH2 + WH3 route into one optimized
  -- run) is a real future need, deliberately not designed/built yet.
  warehouse_id          uuid not null default get_default_warehouse_id() references warehouses(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_routes_driver_id on routes(driver_id);
create index idx_routes_date on routes(date);
create index idx_routes_status on routes(status);
create index idx_routes_region_id on routes(region_id);
create index idx_routes_warehouse_id on routes(warehouse_id);

-- ============================================================
-- SECTION 4.5 — PICK LISTS TABLE
-- ============================================================

create table pick_lists (
  id              text primary key,               -- e.g. PL-2026-041
  generated_by    uuid not null references customers(id) on delete restrict,  -- Admin only
  generated_at    timestamptz not null default now(),
  status          pick_list_status not null default 'ready',
  assigned_to     uuid references customers(id) on delete set null,
  bins            jsonb not null default '[]'::jsonb,
  -- Ordered array of bins with tote arrays, sorted alphanumerically A→B→C
  -- Each entry: { bin_id, totes: [{ tote_id, customer_name, status: 'pending'|'picked' }] }
  completed_at    timestamptz,
  region_id       uuid not null default get_default_region_id() references regions(id),
  -- Which warehouse this pick list's bins belong to. A pick list is
  -- inherently single-warehouse (a bin-order walk through one building).
  warehouse_id    uuid not null default get_default_warehouse_id() references warehouses(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_pick_lists_status on pick_lists(status);
create index idx_pick_lists_assigned_to on pick_lists(assigned_to);
create index idx_pick_lists_region_id on pick_lists(region_id);
create index idx_pick_lists_warehouse_id on pick_lists(warehouse_id);

-- ============================================================
-- SECTION 4.6 — ERRORS TABLE
-- ============================================================

create table errors (
  id              text primary key,               -- e.g. ERR-84291, FC-73812, PD-11042
  type            error_type not null,
  driver_id       uuid references customers(id) on delete set null,
  route_id        text references routes(id) on delete set null,
  tote_id         text references totes(id) on delete set null,
  stop_info       text,                           -- Customer name and address
  error_code      text,                           -- FC-001 through FC-007 for force completes
  detail          text,                           -- Description of the error
  driver_notes    text,
  admin_notes     text,
  resolved        boolean not null default false,
  resolved_by     uuid references customers(id) on delete set null,
  region_id       uuid not null default get_default_region_id() references regions(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_errors_type on errors(type);
create index idx_errors_driver_id on errors(driver_id);
create index idx_errors_route_id on errors(route_id);
create index idx_errors_resolved on errors(resolved);
create index idx_errors_region_id on errors(region_id);

-- ============================================================
-- SECTION 4.7 — DASHBOARD THRESHOLDS TABLE
-- Single-row table (id=1 enforced) holding every Operations Console
-- Dashboard alert threshold, configured at Settings > Thresholds.
-- No per-user overrides — applies to every dashboard immediately.
-- ============================================================

create table dashboard_thresholds (
  id                              int primary key default 1 check (id = 1),
  unstowed_warn                   int not null default 5,
  unstowed_critical               int not null default 15,
  routes_today_warn               int not null default 1,
  routes_today_critical           int not null default 3,
  empty_totes_pace_amber_pts      int not null default 10,   -- amber if behind pace by N points
  empty_totes_pace_red_pts        int not null default 25,
  full_totes_pace_amber_pts       int not null default 10,
  full_totes_pace_red_pts         int not null default 25,
  picks_completed_pace_amber_pts  int not null default 10,
  picks_completed_pace_red_pts    int not null default 25,
  empty_bins_warn                 int not null default 10,   -- inverted: low is bad
  empty_bins_critical             int not null default 4,
  open_pick_totes_warn            int not null default 48,
  open_pick_totes_critical        int not null default 78,
  region_id                       uuid not null default get_default_region_id() references regions(id),
  updated_at                      timestamptz not null default now()
);

insert into dashboard_thresholds (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- AUTO-UPDATE updated_at TIMESTAMPS
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_updated_at before update on customers
  for each row execute function update_updated_at();

create trigger totes_updated_at before update on totes
  for each row execute function update_updated_at();

create trigger routes_updated_at before update on routes
  for each row execute function update_updated_at();

create trigger pick_lists_updated_at before update on pick_lists
  for each row execute function update_updated_at();

create trigger errors_updated_at before update on errors
  for each row execute function update_updated_at();

create trigger dashboard_thresholds_updated_at before update on dashboard_thresholds
  for each row execute function update_updated_at();

-- ============================================================
-- BIN CURRENT_COUNT AUTO-SYNC TRIGGER
-- Keeps bins.current_count in sync when totes move in/out
-- ============================================================

create or replace function sync_bin_count()
returns trigger as $$
begin
  -- Decrement old bin count (if tote was stored)
  if old.bin_location is not null and old.status = 'stored' then
    update bins set current_count = current_count - 1
    where id = old.bin_location;
  end if;

  -- Increment new bin count (if tote is being stored)
  if new.bin_location is not null and new.status = 'stored' then
    update bins set current_count = current_count + 1
    where id = new.bin_location;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger totes_sync_bin_count after update on totes
  for each row execute function sync_bin_count();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table regions enable row level security;
alter table warehouses enable row level security;
alter table locations enable row level security;
alter table customers enable row level security;
alter table totes enable row level security;
alter table bins enable row level security;
alter table routes enable row level security;
alter table pick_lists enable row level security;
alter table errors enable row level security;

-- Helper function: get current user's role without triggering RLS recursion
create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role::text from customers where auth_id = auth.uid() limit 1;
$$;

-- Regions: any authenticated user can read the list (needed for
-- signup/region pickers); only admins can add/edit regions.
create policy "regions_read_all" on regions
  for select using (auth.uid() is not null);

create policy "regions_admin_write" on regions
  for insert with check (get_my_role() = 'admin');

create policy "regions_admin_update" on regions
  for update using (get_my_role() = 'admin');

-- Warehouses: any authenticated user can read the list (needed for
-- warehouse pickers); only admins can add/edit. No delete policy —
-- same gap regions already has today, kept deliberately consistent.
create policy "warehouses_read_all" on warehouses
  for select using (auth.uid() is not null);

create policy "warehouses_admin_write" on warehouses
  for insert with check (get_my_role() = 'admin');

create policy "warehouses_admin_update" on warehouses
  for update using (get_my_role() = 'admin');

-- Locations (drop zones/staging zones): staff read; warehouse/admin write
create policy "locations_staff_read" on locations
  for select using (get_my_role() in ('driver','warehouse','sorter','admin'));

create policy "locations_warehouse_write" on locations
  for all using (get_my_role() in ('warehouse','admin'));

-- Customers: self read/insert/update + admin all
create policy "customers_self_read" on customers
  for select using (auth.uid() = auth_id);

create policy "customers_self_insert" on customers
  for insert with check (auth.uid() = auth_id);

create policy "customers_self_update" on customers
  for update using (auth.uid() = auth_id);

create policy "customers_admin_all" on customers
  for all using (get_my_role() = 'admin');

-- Totes: customers see only their own; staff see all
create policy "totes_owner_read" on totes
  for select using (
    customer_id in (select id from customers where auth_id = auth.uid())
  );

create policy "totes_staff_all" on totes
  for all using (get_my_role() in ('driver','warehouse','sorter','admin'));

-- Bins: staff read; warehouse/admin write
create policy "bins_staff_read" on bins
  for select using (get_my_role() in ('driver','warehouse','sorter','admin'));

create policy "bins_warehouse_write" on bins
  for all using (get_my_role() in ('warehouse','admin'));

-- Routes: drivers see their own; admins see all
create policy "routes_driver_read" on routes
  for select using (
    driver_id in (select id from customers where auth_id = auth.uid())
  );

create policy "routes_admin_all" on routes
  for all using (get_my_role() = 'admin');

-- Pick lists: warehouse + admin
create policy "pick_lists_warehouse_all" on pick_lists
  for all using (get_my_role() in ('warehouse','sorter','admin'));

-- Errors: admin all; drivers can insert
create policy "errors_admin_all" on errors
  for all using (get_my_role() = 'admin');

create policy "errors_driver_insert" on errors
  for insert with check (get_my_role() in ('driver','admin'));

-- Dashboard thresholds: admin only (Operations Console Settings > Thresholds)
alter table dashboard_thresholds enable row level security;

create policy "dashboard_thresholds_admin_all" on dashboard_thresholds
  for all using (get_my_role() = 'admin');

-- ============================================================
-- SUPABASE STORAGE BUCKETS (run separately in dashboard or via API)
-- ============================================================
-- bucket: tote-photos       (public read, authenticated write)
-- bucket: seal-photos       (public read, authenticated write)
-- bucket: invoice-pdfs      (private, authenticated read)

-- ============================================================
-- MIGRATIONS (run these in Supabase SQL editor after initial schema setup)
-- ============================================================

-- ✅ Done — empty_since (grace period billing, Section 11.1). Confirmed live in schema May 2026.
-- ALTER TABLE totes ADD COLUMN IF NOT EXISTS empty_since timestamptz;

-- ✅ Done — pickup_requested (customer pickup requests). Confirmed live in schema May 2026.
-- ALTER TABLE totes ADD COLUMN IF NOT EXISTS pickup_requested boolean not null default false;

-- ✅ Done — route_status 'returning' value (driver drop-off flow). Applied 2026-07-27.
-- ALTER TYPE route_status ADD VALUE IF NOT EXISTS 'returning';

-- ✅ Done — regions table + region_id everywhere (multi-region/franchise
-- readiness). Applied 2026-08-03. Written against the LIVE schema, which
-- already had these tables without region_id — safe to re-run (all IF NOT EXISTS).
-- CREATE TABLE IF NOT EXISTS regions (
--   id          uuid primary key default uuid_generate_v4(),
--   name        text not null,
--   slug        text not null unique,
--   created_at  timestamptz not null default now()
-- );
--
-- INSERT INTO regions (name, slug)
--   SELECT 'Lehigh Valley', 'lehigh-valley'
--   WHERE NOT EXISTS (SELECT 1 FROM regions WHERE slug = 'lehigh-valley');
--
-- CREATE OR REPLACE FUNCTION get_default_region_id()
-- RETURNS uuid LANGUAGE sql STABLE AS $$
--   SELECT id FROM regions WHERE slug = 'lehigh-valley' LIMIT 1;
-- $$;
--
-- ALTER TABLE customers  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
-- ALTER TABLE totes      ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
-- ALTER TABLE bins       ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
-- ALTER TABLE routes     ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
-- ALTER TABLE pick_lists ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
-- ALTER TABLE errors     ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
--
-- UPDATE customers  SET region_id = get_default_region_id() WHERE region_id IS NULL;
-- UPDATE totes      SET region_id = get_default_region_id() WHERE region_id IS NULL;
-- UPDATE bins       SET region_id = get_default_region_id() WHERE region_id IS NULL;
-- UPDATE routes     SET region_id = get_default_region_id() WHERE region_id IS NULL;
-- UPDATE pick_lists SET region_id = get_default_region_id() WHERE region_id IS NULL;
-- UPDATE errors     SET region_id = get_default_region_id() WHERE region_id IS NULL;
--
-- ALTER TABLE customers  ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
-- ALTER TABLE totes      ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
-- ALTER TABLE bins       ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
-- ALTER TABLE routes     ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
-- ALTER TABLE pick_lists ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
-- ALTER TABLE errors     ALTER COLUMN region_id SET NOT NULL, ALTER COLUMN region_id SET DEFAULT get_default_region_id();
--
-- CREATE INDEX IF NOT EXISTS idx_customers_region_id  ON customers(region_id);
-- CREATE INDEX IF NOT EXISTS idx_totes_region_id      ON totes(region_id);
-- CREATE INDEX IF NOT EXISTS idx_bins_region_id       ON bins(region_id);
-- CREATE INDEX IF NOT EXISTS idx_routes_region_id     ON routes(region_id);
-- CREATE INDEX IF NOT EXISTS idx_pick_lists_region_id ON pick_lists(region_id);
-- CREATE INDEX IF NOT EXISTS idx_errors_region_id     ON errors(region_id);
--
-- ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "regions_read_all" ON regions FOR SELECT USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "regions_admin_write" ON regions FOR INSERT WITH CHECK (get_my_role() = 'admin');
-- CREATE POLICY "regions_admin_update" ON regions FOR UPDATE USING (get_my_role() = 'admin');
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;

-- ✅ Done — tote_requests table (structured customer requests from the app).
-- Confirmed live in schema May 2026. Live table also has an `admin_notes text` column
-- not reflected below — add it here if you ever recreate this table from scratch.
--
-- ✅ type column below UPDATED and APPLIED to the live constraint 2026-08-05
-- (confirmed via pg_get_constraintdef in the Supabase SQL editor).
-- Was ('empty_tote_delivery', 'pickup') only, but app code had already drifted to
-- also insert 'empty_tote_return' and 'tote_return' (neither ever added here or to
-- the live constraint, with unchecked insert errors — likely silently failing).
-- Fixed by simplifying instead of just widening the constraint: 'empty_tote_return'
-- is retired (folded into 'pickup' — full vs. empty is derived live from each tote's
-- current item count, not stored, since a customer can edit contents after
-- requesting pickup). 'tote_return' is renamed 'full_tote_delivery' — clearer
-- direction (totes delivered back TO the customer; 'return' was ambiguous, also used
-- for totes returning TO the warehouse).
-- CREATE TABLE IF NOT EXISTS tote_requests (
--   id              uuid primary key default uuid_generate_v4(),
--   customer_id     uuid not null references customers(id) on delete cascade,
--   type            text not null check (type in ('empty_tote_delivery', 'full_tote_delivery', 'pickup')),
--   quantity        int,
--   tote_ids        text[] not null default '{}',
--   preferred_date  date,
--   status          text not null default 'pending' check (status in ('pending', 'acknowledged', 'complete')),
--   admin_notes     text,
--   completed_at    timestamptz,
--   created_at      timestamptz not null default now(),
--   updated_at      timestamptz not null default now()
-- );

-- ✅ Done — tote_requests.completed_at (Orders "Date Delivered" tracking,
-- added 2026-08-08, migration applied by user same day). The driver's
-- stop-completion flow sets status = 'complete' + this timestamp
-- automatically once the linked route stop is completed (normal or
-- force-complete) — see order_ref on RouteStop in database.ts and
-- completeStop()/handleForceComplete() in
-- driver/stop/[routeId]/[stopNum]/page.tsx.
--
-- ALTER TABLE tote_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ✅ Done — dashboard_thresholds table (Operations Console rebuild, Section 4.7
-- above). Applied by user 2026-08-06. Written as CREATE TABLE IF NOT EXISTS /
-- IF NOT EXISTS everywhere so it's safe to re-run, matching the regions
-- migration's style above.
--
-- CREATE TABLE IF NOT EXISTS dashboard_thresholds (
--   id                              int primary key default 1 check (id = 1),
--   unstowed_warn                   int not null default 5,
--   unstowed_critical               int not null default 15,
--   routes_today_warn               int not null default 1,
--   routes_today_critical           int not null default 3,
--   empty_totes_pace_amber_pts      int not null default 10,
--   empty_totes_pace_red_pts        int not null default 25,
--   full_totes_pace_amber_pts       int not null default 10,
--   full_totes_pace_red_pts         int not null default 25,
--   picks_completed_pace_amber_pts  int not null default 10,
--   picks_completed_pace_red_pts    int not null default 25,
--   empty_bins_warn                 int not null default 10,
--   empty_bins_critical             int not null default 4,
--   open_pick_totes_warn            int not null default 48,
--   open_pick_totes_critical        int not null default 78,
--   region_id                       uuid not null default get_default_region_id() references regions(id),
--   updated_at                      timestamptz not null default now()
-- );
--
-- INSERT INTO dashboard_thresholds (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
--
-- CREATE OR REPLACE FUNCTION update_updated_at()
-- RETURNS trigger AS $$
-- BEGIN NEW.updated_at = now(); RETURN NEW; END;
-- $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS dashboard_thresholds_updated_at ON dashboard_thresholds;
-- CREATE TRIGGER dashboard_thresholds_updated_at BEFORE UPDATE ON dashboard_thresholds
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--
-- ALTER TABLE dashboard_thresholds ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "dashboard_thresholds_admin_all" ON dashboard_thresholds;
-- CREATE POLICY "dashboard_thresholds_admin_all" ON dashboard_thresholds
--   FOR ALL USING (get_my_role() = 'admin');
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_thresholds TO authenticated;

-- ✅ DONE — warehouses + locations tables, multi-warehouse readiness
-- (Sections 4.0.1/4.0.2 above), plus totes.current_location_id,
-- routes.warehouse_id, pick_lists.warehouse_id. Added 2026-08-09 ahead of
-- a second physical warehouse going live — user's explicit design
-- decisions: bins stay untouched this phase (existing bin IDs don't need
-- relabeling yet — see the "Phase 4 (future)" note at the bottom of this
-- block); totes get NO warehouse_id of their own, only
-- current_location_id, so a tote's warehouse is always derived from
-- whatever location currently holds it, never stored redundantly.
--
-- Applied live 2026-08-09. GRANTs verified via information_schema.role_table_grants
-- (both tables show SELECT/INSERT/UPDATE/DELETE for `authenticated`) — no
-- repeat of the tote_requests gap. Block kept commented here as a record;
-- the version actually run was pasted directly into the SQL editor, in
-- order, matching this block statement-for-statement.
--
-- CREATE TABLE IF NOT EXISTS warehouses (
--   id          uuid primary key default uuid_generate_v4(),
--   region_id   uuid not null references regions(id),
--   name        text not null,
--   code        text not null unique,
--   address     text,
--   created_at  timestamptz not null default now()
-- );
--
-- INSERT INTO warehouses (region_id, name, code)
--   SELECT id, 'Coopersburg Main', 'WH1' FROM regions WHERE slug = 'lehigh-valley'
--   AND NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'WH1');
--
-- CREATE INDEX IF NOT EXISTS idx_warehouses_region_id ON warehouses(region_id);
--
-- CREATE OR REPLACE FUNCTION get_default_warehouse_id()
-- RETURNS uuid LANGUAGE sql STABLE AS $$
--   SELECT id FROM warehouses WHERE code = 'WH1' LIMIT 1;
-- $$;
--
-- DO $$ BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_type') THEN
--     CREATE TYPE location_type AS ENUM ('drop_zone', 'staging_zone');
--   END IF;
-- END $$;
--
-- CREATE TABLE IF NOT EXISTS locations (
--   id            uuid primary key default uuid_generate_v4(),
--   warehouse_id  uuid not null references warehouses(id),
--   type          location_type not null,
--   code          text not null,
--   notes         text,
--   created_at    timestamptz not null default now(),
--   UNIQUE (warehouse_id, code)
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_locations_warehouse_id ON locations(warehouse_id);
-- CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
--
-- ALTER TABLE totes ADD COLUMN IF NOT EXISTS current_location_id uuid REFERENCES locations(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_totes_current_location_id ON totes(current_location_id);
--
-- ALTER TABLE routes     ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);
-- ALTER TABLE pick_lists ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);
--
-- UPDATE routes     SET warehouse_id = get_default_warehouse_id() WHERE warehouse_id IS NULL;
-- UPDATE pick_lists SET warehouse_id = get_default_warehouse_id() WHERE warehouse_id IS NULL;
--
-- ALTER TABLE routes     ALTER COLUMN warehouse_id SET NOT NULL, ALTER COLUMN warehouse_id SET DEFAULT get_default_warehouse_id();
-- ALTER TABLE pick_lists ALTER COLUMN warehouse_id SET NOT NULL, ALTER COLUMN warehouse_id SET DEFAULT get_default_warehouse_id();
--
-- CREATE INDEX IF NOT EXISTS idx_routes_warehouse_id ON routes(warehouse_id);
-- CREATE INDEX IF NOT EXISTS idx_pick_lists_warehouse_id ON pick_lists(warehouse_id);
--
-- ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE locations  ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "warehouses_read_all" ON warehouses;
-- CREATE POLICY "warehouses_read_all" ON warehouses
--   FOR SELECT USING (auth.uid() IS NOT NULL);
-- DROP POLICY IF EXISTS "warehouses_admin_write" ON warehouses;
-- CREATE POLICY "warehouses_admin_write" ON warehouses
--   FOR INSERT WITH CHECK (get_my_role() = 'admin');
-- DROP POLICY IF EXISTS "warehouses_admin_update" ON warehouses;
-- CREATE POLICY "warehouses_admin_update" ON warehouses
--   FOR UPDATE USING (get_my_role() = 'admin');
--
-- DROP POLICY IF EXISTS "locations_staff_read" ON locations;
-- CREATE POLICY "locations_staff_read" ON locations
--   FOR SELECT USING (get_my_role() IN ('driver','warehouse','sorter','admin'));
-- DROP POLICY IF EXISTS "locations_warehouse_write" ON locations;
-- CREATE POLICY "locations_warehouse_write" ON locations
--   FOR ALL USING (get_my_role() IN ('warehouse','admin'));
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
--
-- ⚠️ After running this, VERIFY THE GRANTS ACTUALLY LANDED — don't just
-- trust the SQL "looked like it ran". This exact class of bug (a table
-- silently missing from the real live GRANTs, with client writes doing
-- nothing and no error surfaced) already happened once this session with
-- tote_requests — see this file's CLAUDE.md-documented GRANTs section.
-- Run this and confirm both rows come back:
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('warehouses','locations') AND grantee = 'authenticated';
--
-- ⏳ PENDING — bins.warehouse_id (Phase 4 of multi-warehouse readiness).
-- Added 2026-08-09, once a second warehouse became imminent enough that
-- the user asked for this to be built ahead of it. Existing bin IDs (e.g.
-- "A-12") are NOT renamed — that would be a real physical relabeling event
-- for WH1's already-printed labels, not something forced as a side effect
-- of this migration. Only NEW bins created for a non-default warehouse get
-- a warehouse-code-prefixed id going forward (e.g. "WH2-A-12"), enforced
-- in app code (admin/warehouse-setup), not a DB constraint — Postgres has
-- no clean way to say "unique per warehouse_id, but grandfather in rows
-- that predate this column," so `bins.id` stays one global unique text PK.
--
-- Run this whole block in the Supabase SQL editor, in order. Then flip
-- this to ✅ Done.
--
-- ALTER TABLE bins ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);
--
-- UPDATE bins SET warehouse_id = get_default_warehouse_id() WHERE warehouse_id IS NULL;
--
-- ALTER TABLE bins ALTER COLUMN warehouse_id SET NOT NULL, ALTER COLUMN warehouse_id SET DEFAULT get_default_warehouse_id();
--
-- CREATE INDEX IF NOT EXISTS idx_bins_warehouse_id ON bins(warehouse_id);
--
-- No new RLS policies needed — bins' existing policies (role-based, not
-- column-based) already cover this new column. No new GRANT needed either
-- — bins is already in the ✅ Done GRANTs list in CLAUDE.md.
--
-- Verify the backfill landed before building/using warehouse-scoped bin
-- code: SELECT COUNT(*) FROM bins WHERE warehouse_id IS NULL; -- must be 0
--
-- pickLists.ts's bin-selection logic and warehouse/reports' Bins tab were
-- both scoped by warehouse later the same day (2026-08-09) — see CLAUDE.md.
-- warehouse/scan-store's bin-scan step was evaluated and deliberately left
-- unscoped (not a correctness bug — bin ids are globally unique — just a
-- missing human-error guardrail; user's explicit call to skip it for now).

-- ============================================================
-- ✅ DONE — warehouse_rows table + locations.map_x/map_y (Warehouse
-- Floor Map / "Warehouse Editor", TODO #10). Added 2026-08-09 per the
-- user's detailed spec: a visual floor-plan view under Warehouse Setup,
-- alongside (not replacing) the existing list-based Bin Layout. Design
-- decisions confirmed directly by the user:
--   - Bins are still CREATED via the existing "New Row" form — the map is
--     for arranging/visualizing what already exists, not for drawing new
--     rows into being.
--   - Whole ROWS are freely draggable to any position, AND each row stores
--     its own real orientation (not all rows run the same direction on a
--     real floor) — this is why a new `warehouse_rows` table exists at
--     all, rather than just adding columns to `bins`: position/orientation
--     is a property of the row as a unit, not of each individual bin.
--   - There are TWO separate rotation mechanisms, not one: a global
--     "rotate my view" button (client-side only, not stored — lets the
--     operator orient the whole map to match which way they're facing on
--     the floor) AND each row's own stored `rotation`, which is real
--     layout data.
--   - Individual bin capacity overrides (e.g. "bin A-04 can only hold 2,
--     not 10, something's in the way") already exist via
--     warehouse/reports' Bins tab (`bins.capacity`, no schema change
--     needed) — the Floor Map reuses that same click-to-edit interaction,
--     just placed spatially instead of in a list.
--
-- `map_x`/`map_y` are integer grid cells, not pixels (matches the
-- Excel-drag-to-fill metaphor the rest of Warehouse Setup already uses).
-- A row's (map_x, map_y) is its anchor (top-left corner); its bins render
-- in sequence extending from there in the direction implied by rotation.
--
-- Applied live 2026-08-09. GRANT verified via information_schema.role_table_grants
-- (7 rows for warehouse_rows/authenticated, including SELECT/INSERT/UPDATE/
-- DELETE). Block kept commented here as a record; the version actually run
-- was pasted directly into the SQL editor, matching this statement-for-statement.
--
-- CREATE TABLE IF NOT EXISTS warehouse_rows (
--   id            uuid primary key default uuid_generate_v4(),
--   warehouse_id  uuid not null references warehouses(id),
--   row           text not null,
--   map_x         integer not null default 0,
--   map_y         integer not null default 0,
--   rotation      integer not null default 0, -- degrees: 0, 90, 180, or 270
--   created_at    timestamptz not null default now(),
--   UNIQUE (warehouse_id, row)
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_warehouse_rows_warehouse_id ON warehouse_rows(warehouse_id);
--
-- -- Backfill: every (warehouse_id, row) combo that already exists in bins
-- -- gets a default entry — stacked vertically, one cell apart, in
-- -- alphabetical order, all horizontal (rotation 0). Purely a starting
-- -- point; the user drags/rotates rows afterward to match their real floor.
-- INSERT INTO warehouse_rows (warehouse_id, row, map_x, map_y, rotation)
-- SELECT warehouse_id, row, 0, (ROW_NUMBER() OVER (PARTITION BY warehouse_id ORDER BY row) - 1)::int, 0
-- FROM (SELECT DISTINCT warehouse_id, row FROM bins) t
-- ON CONFLICT (warehouse_id, row) DO NOTHING;
--
-- ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_x integer;
-- ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_y integer;
-- -- NULL map_x/map_y means "not yet placed on the map" — the zone still
-- -- exists and works everywhere else, it just renders in an "unplaced"
-- -- tray on the Floor Map until dragged onto the grid once.
--
-- ALTER TABLE warehouse_rows ENABLE ROW LEVEL SECURITY;
--
-- -- Same shape as bins' own policies (schema.sql, search "bins_staff_read")
-- -- — staff read, warehouse/admin write.
-- CREATE POLICY "warehouse_rows_staff_read" ON warehouse_rows
--   FOR SELECT USING (get_my_role() IN ('driver','warehouse','sorter','admin'));
-- CREATE POLICY "warehouse_rows_warehouse_write" ON warehouse_rows
--   FOR ALL USING (get_my_role() IN ('warehouse','admin'));
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_rows TO authenticated;
--
-- ⚠️ After running this, VERIFY THE GRANT ACTUALLY LANDED, same as every
-- other migration in this file:
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'warehouse_rows' AND grantee = 'authenticated';
--
-- Also verify the backfill: SELECT COUNT(*) FROM warehouse_rows; should
-- equal the number of distinct (warehouse_id, row) pairs in bins —
-- SELECT COUNT(DISTINCT (warehouse_id, row)) FROM bins; — same number.

-- ============================================================
-- ⏳ PENDING — warehouses.map_view_rotation (Floor Map, TODO #10 follow-up).
-- Added 2026-08-09 per direct user feedback after trying the Floor Map
-- live: rotating the whole-map view was resetting on every page load, and
-- the user wants it to stay how they left it. Persisted per warehouse
-- (shared across whoever opens that warehouse's map), not per-browser —
-- it's treated as a fact about how that warehouse's map should be viewed,
-- not a personal per-operator preference. No nullable-then-backfill dance
-- needed here (unlike most migrations in this file) — DEFAULT 0 is always
-- a valid, safe starting value, so this goes straight to NOT NULL.
--
-- ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS map_view_rotation integer NOT NULL DEFAULT 0;
--
-- No RLS/GRANT changes needed — warehouses already has both from the
-- "warehouses + locations tables" migration above; this just adds a column
-- to an already-covered table.
--
-- Run this, then flip to ✅ Done.

-- ============================================================
-- SEED DATA: Default bin setup (rows A, B, C — 10 totes each)
-- Uncomment to populate a starting warehouse layout
-- ============================================================

-- insert into bins (id, row, capacity) values
--   ('A-01', 'A', 10), ('A-02', 'A', 10), ('A-03', 'A', 10), ('A-04', 'A', 10), ('A-05', 'A', 10),
--   ('A-06', 'A', 10), ('A-07', 'A', 10), ('A-08', 'A', 10), ('A-09', 'A', 10), ('A-10', 'A', 10),
--   ('B-01', 'B', 10), ('B-02', 'B', 10), ('B-03', 'B', 10), ('B-04', 'B', 10), ('B-05', 'B', 10),
--   ('B-06', 'B', 10), ('B-07', 'B', 10), ('B-08', 'B', 10), ('B-09', 'B', 10), ('B-10', 'B', 10),
--   ('C-01', 'C', 10), ('C-02', 'C', 10), ('C-03', 'C', 10), ('C-04', 'C', 10), ('C-05', 'C', 10),
--   ('C-06', 'C', 10), ('C-07', 'C', 10), ('C-08', 'C', 10), ('C-09', 'C', 10), ('C-10', 'C', 10);
