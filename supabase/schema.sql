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
  'complete'
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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Link to Supabase Auth (one customer row per auth user)
alter table customers add column auth_id uuid unique references auth.users(id) on delete cascade;

create index idx_customers_email on customers(email);
create index idx_customers_auth_id on customers(auth_id);
create index idx_customers_status on customers(status);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_totes_customer_id on totes(customer_id);
create index idx_totes_status on totes(status);
create index idx_totes_bin_location on totes(bin_location);
create index idx_totes_seal_number on totes(seal_number);

-- ============================================================
-- SECTION 4.3 — BINS TABLE
-- ============================================================

create table bins (
  id              text primary key,               -- e.g. A-12
  row             char(1) not null,               -- e.g. A, B, C for pick list optimization
  capacity        int not null default 10,        -- Max totes
  current_count   int not null default 0,         -- Computed from totes table
  notes           text                            -- Admin notes
);

create index idx_bins_row on bins(row);

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
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_routes_driver_id on routes(driver_id);
create index idx_routes_date on routes(date);
create index idx_routes_status on routes(status);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_pick_lists_status on pick_lists(status);
create index idx_pick_lists_assigned_to on pick_lists(assigned_to);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_errors_type on errors(type);
create index idx_errors_driver_id on errors(driver_id);
create index idx_errors_route_id on errors(route_id);
create index idx_errors_resolved on errors(resolved);

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

-- ============================================================
-- SUPABASE STORAGE BUCKETS (run separately in dashboard or via API)
-- ============================================================
-- bucket: tote-photos       (public read, authenticated write)
-- bucket: seal-photos       (public read, authenticated write)
-- bucket: invoice-pdfs      (private, authenticated read)

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
