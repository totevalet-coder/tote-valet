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
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_routes_driver_id on routes(driver_id);
create index idx_routes_date on routes(date);
create index idx_routes_status on routes(status);
create index idx_routes_region_id on routes(region_id);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_pick_lists_status on pick_lists(status);
create index idx_pick_lists_assigned_to on pick_lists(assigned_to);
create index idx_pick_lists_region_id on pick_lists(region_id);

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
--   created_at      timestamptz not null default now(),
--   updated_at      timestamptz not null default now()
-- );

-- ⬜ PENDING — dashboard_thresholds table (Operations Console rebuild, Section 4.7
-- above). Run this whole block in the Supabase SQL editor, then flip this to ✅ Done.
-- Written as CREATE TABLE IF NOT EXISTS / IF NOT EXISTS everywhere so it's safe to
-- re-run, matching the regions migration's style above.
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
