// ============================================================
// Tote Valet — Database Types (mirrors schema.sql)
// ============================================================

export type UserRole = 'customer' | 'driver' | 'warehouse' | 'sorter' | 'admin'
export type AccountStatus = 'active' | 'suspended' | 'failed_payment'
export type ToteStatus =
  | 'empty_at_customer'
  | 'in_transit'
  | 'ready_to_stow'
  | 'stored'
  | 'pending_pick'
  | 'picked'
  | 'returned_to_station'
  | 'error'
export type RouteStatus = 'planned' | 'in_progress' | 'returning' | 'complete'
export type PickListStatus = 'ready' | 'in_progress' | 'complete'
export type ErrorType = 'seal_mismatch' | 'force_complete' | 'partial_delivery' | 'unexpected_tote'

// ============================================================
// Section 4.1 — Customer
// ============================================================
export interface Customer {
  id: string
  auth_id: string | null
  name: string
  email: string
  phone: string | null
  address: string | null
  card_on_file: string | null      // Stripe payment method ID
  monthly_total: number
  status: AccountStatus
  role: UserRole
  free_exchanges_used: number
  joined_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Section 4.2 — Tote
// ============================================================
export interface ToteItem {
  label: string
  photo_url?: string
  ai_generated?: boolean
}

export interface Tote {
  id: string                       // e.g. TV-0031
  customer_id: string
  tote_name: string | null
  seal_number: string | null       // e.g. SL-4831
  photo_url: string | null         // legacy single photo
  photo_urls: string[]             // storage paths — up to 5
  status: ToteStatus
  bin_location: string | null      // e.g. A-12
  last_scan_date: string | null
  items: ToteItem[]
  created_at: string
  updated_at: string
}

// ============================================================
// Section 4.3 — Bin
// ============================================================
export interface Bin {
  id: string                       // e.g. A-12
  row: string                      // e.g. A, B, C
  capacity: number
  current_count: number
  notes: string | null
}

// ============================================================
// Section 4.4 — Route
// ============================================================
export interface RouteStop {
  stop_number: number
  customer_id: string
  customer_name: string
  address: string
  type: 'pickup' | 'delivery'
  tote_ids: string[]
  seal_numbers?: string[]
  notes?: string
  completed: boolean
  force_completed: boolean
  error_id?: string
}

export interface Route {
  id: string                       // e.g. RT-001
  driver_id: string | null
  date: string
  status: RouteStatus
  stops: RouteStop[]
  completed_at: string | null
  force_complete_count: number
  error_count: number
  created_at: string
  updated_at: string
}

// ============================================================
// Section 4.5 — Pick List
// ============================================================
export interface PickListTote {
  tote_id: string
  customer_name: string
  status: 'pending' | 'picked'
}

export interface PickListBin {
  bin_id: string
  totes: PickListTote[]
}

export interface PickList {
  id: string                       // e.g. PL-2026-041
  generated_by: string
  generated_at: string
  status: PickListStatus
  assigned_to: string | null
  bins: PickListBin[]
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Section 4.6 — Error / Flag
// ============================================================

// Force Complete error codes (Section 6.4)
export type ForceCompleteCode =
  | 'FC-001'  // Scanner hardware failure
  | 'FC-002'  // Tote barcode unreadable/damaged
  | 'FC-003'  // Seal barcode unreadable/damaged
  | 'FC-004'  // App connectivity issue
  | 'FC-005'  // Customer present, totes handed over directly
  | 'FC-006'  // Time-critical situation, supervisor approved
  | 'FC-007'  // Other — see notes

export interface ToteError {
  id: string                       // e.g. ERR-84291
  type: ErrorType
  driver_id: string | null
  route_id: string | null
  tote_id: string | null
  stop_info: string | null
  error_code: string | null
  detail: string | null
  driver_notes: string | null
  admin_notes: string | null
  resolved: boolean
  resolved_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Supabase DB type (for typed client)
// ============================================================
export interface Database {
  public: {
    Tables: {
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>
      }
      totes: {
        Row: Tote
        Insert: Omit<Tote, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Tote, 'id' | 'created_at' | 'updated_at'>>
      }
      bins: {
        Row: Bin
        Insert: Bin
        Update: Partial<Bin>
      }
      routes: {
        Row: Route
        Insert: Omit<Route, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Route, 'id' | 'created_at' | 'updated_at'>>
      }
      pick_lists: {
        Row: PickList
        Insert: Omit<PickList, 'created_at' | 'updated_at'>
        Update: Partial<Omit<PickList, 'id' | 'created_at' | 'updated_at'>>
      }
      errors: {
        Row: ToteError
        Insert: Omit<ToteError, 'created_at' | 'updated_at'>
        Update: Partial<Omit<ToteError, 'id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}
