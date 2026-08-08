export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bins: {
        Row: {
          capacity: number
          current_count: number
          id: string
          notes: string | null
          region_id: string
          row: string
        }
        Insert: {
          capacity?: number
          current_count?: number
          id: string
          notes?: string | null
          region_id?: string
          row: string
        }
        Update: {
          capacity?: number
          current_count?: number
          id?: string
          notes?: string | null
          region_id?: string
          row?: string
        }
        Relationships: [
          {
            foreignKeyName: "bins_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          auth_id: string | null
          card_on_file: string | null
          created_at: string
          email: string
          free_exchanges_used: number
          id: string
          joined_date: string
          monthly_total: number | null
          name: string
          notes: string | null
          phone: string | null
          region_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          auth_id?: string | null
          card_on_file?: string | null
          created_at?: string
          email: string
          free_exchanges_used?: number
          id?: string
          joined_date?: string
          monthly_total?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          region_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          auth_id?: string | null
          card_on_file?: string | null
          created_at?: string
          email?: string
          free_exchanges_used?: number
          id?: string
          joined_date?: string
          monthly_total?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          region_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_thresholds: {
        Row: {
          empty_bins_critical: number
          empty_bins_warn: number
          empty_totes_pace_amber_pts: number
          empty_totes_pace_red_pts: number
          full_totes_pace_amber_pts: number
          full_totes_pace_red_pts: number
          id: number
          open_pick_totes_critical: number
          open_pick_totes_warn: number
          picks_completed_pace_amber_pts: number
          picks_completed_pace_red_pts: number
          region_id: string
          routes_today_critical: number
          routes_today_warn: number
          unstowed_critical: number
          unstowed_warn: number
          updated_at: string
        }
        Insert: {
          empty_bins_critical?: number
          empty_bins_warn?: number
          empty_totes_pace_amber_pts?: number
          empty_totes_pace_red_pts?: number
          full_totes_pace_amber_pts?: number
          full_totes_pace_red_pts?: number
          id?: number
          open_pick_totes_critical?: number
          open_pick_totes_warn?: number
          picks_completed_pace_amber_pts?: number
          picks_completed_pace_red_pts?: number
          region_id?: string
          routes_today_critical?: number
          routes_today_warn?: number
          unstowed_critical?: number
          unstowed_warn?: number
          updated_at?: string
        }
        Update: {
          empty_bins_critical?: number
          empty_bins_warn?: number
          empty_totes_pace_amber_pts?: number
          empty_totes_pace_red_pts?: number
          full_totes_pace_amber_pts?: number
          full_totes_pace_red_pts?: number
          id?: number
          open_pick_totes_critical?: number
          open_pick_totes_warn?: number
          picks_completed_pace_amber_pts?: number
          picks_completed_pace_red_pts?: number
          region_id?: string
          routes_today_critical?: number
          routes_today_warn?: number
          unstowed_critical?: number
          unstowed_warn?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_thresholds_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      errors: {
        Row: {
          admin_notes: string | null
          created_at: string
          detail: string | null
          driver_id: string | null
          driver_notes: string | null
          error_code: string | null
          id: string
          region_id: string
          resolved: boolean
          resolved_by: string | null
          route_id: string | null
          stop_info: string | null
          tote_id: string | null
          type: Database["public"]["Enums"]["error_type"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          detail?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          error_code?: string | null
          id: string
          region_id?: string
          resolved?: boolean
          resolved_by?: string | null
          route_id?: string | null
          stop_info?: string | null
          tote_id?: string | null
          type: Database["public"]["Enums"]["error_type"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          detail?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          error_code?: string | null
          id?: string
          region_id?: string
          resolved?: boolean
          resolved_by?: string | null
          route_id?: string | null
          stop_info?: string | null
          tote_id?: string | null
          type?: Database["public"]["Enums"]["error_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "errors_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errors_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errors_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errors_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "errors_tote_id_fkey"
            columns: ["tote_id"]
            isOneToOne: false
            referencedRelation: "totes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          customer_id: string
          id: string
          read: boolean | null
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string | null
          customer_id: string
          id?: string
          read?: boolean | null
          title: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          read?: boolean | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_lists: {
        Row: {
          assigned_to: string | null
          bins: PickListBin[]
          completed_at: string | null
          created_at: string
          generated_at: string
          generated_by: string
          id: string
          region_id: string
          status: Database["public"]["Enums"]["pick_list_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          bins?: PickListBin[]
          completed_at?: string | null
          created_at?: string
          generated_at?: string
          generated_by: string
          id: string
          region_id?: string
          status?: Database["public"]["Enums"]["pick_list_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          bins?: PickListBin[]
          completed_at?: string | null
          created_at?: string
          generated_at?: string
          generated_by?: string
          id?: string
          region_id?: string
          status?: Database["public"]["Enums"]["pick_list_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_lists_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_lists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_lists_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          completed_at: string | null
          created_at: string
          date: string
          driver_id: string | null
          error_count: number
          force_complete_count: number
          id: string
          region_id: string
          status: Database["public"]["Enums"]["route_status"]
          stops: RouteStop[]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          date: string
          driver_id?: string | null
          error_count?: number
          force_complete_count?: number
          id: string
          region_id?: string
          status?: Database["public"]["Enums"]["route_status"]
          stops?: RouteStop[]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          date?: string
          driver_id?: string | null
          error_count?: number
          force_complete_count?: number
          id?: string
          region_id?: string
          status?: Database["public"]["Enums"]["route_status"]
          stops?: RouteStop[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      tote_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          completed_at: string | null
          customer_id: string
          id: string
          preferred_date: string | null
          quantity: number | null
          status: string
          tote_ids: string[] | null
          type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          completed_at?: string | null
          customer_id: string
          id?: string
          preferred_date?: string | null
          quantity?: number | null
          status?: string
          tote_ids?: string[] | null
          type: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          completed_at?: string | null
          customer_id?: string
          id?: string
          preferred_date?: string | null
          quantity?: number | null
          status?: string
          tote_ids?: string[] | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tote_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      totes: {
        Row: {
          bin_location: string | null
          created_at: string
          customer_id: string
          empty_since: string | null
          id: string
          items: ToteItem[] | null
          last_scan_date: string | null
          photo_url: string | null
          photo_urls: string[] | null
          pickup_requested: boolean | null
          region_id: string
          seal_number: string | null
          status: Database["public"]["Enums"]["tote_status"]
          tote_name: string | null
          updated_at: string
        }
        Insert: {
          bin_location?: string | null
          created_at?: string
          customer_id: string
          empty_since?: string | null
          id: string
          items?: ToteItem[] | null
          last_scan_date?: string | null
          photo_url?: string | null
          photo_urls?: string[] | null
          pickup_requested?: boolean | null
          region_id?: string
          seal_number?: string | null
          status?: Database["public"]["Enums"]["tote_status"]
          tote_name?: string | null
          updated_at?: string
        }
        Update: {
          bin_location?: string | null
          created_at?: string
          customer_id?: string
          empty_since?: string | null
          id?: string
          items?: ToteItem[] | null
          last_scan_date?: string | null
          photo_url?: string | null
          photo_urls?: string[] | null
          pickup_requested?: boolean | null
          region_id?: string
          seal_number?: string | null
          status?: Database["public"]["Enums"]["tote_status"]
          tote_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "totes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: { Args: never; Returns: string }
    }
    Enums: {
      account_status: "active" | "suspended" | "failed_payment"
      error_type:
        | "seal_mismatch"
        | "force_complete"
        | "partial_delivery"
        | "unexpected_tote"
      pick_list_status: "ready" | "in_progress" | "complete"
      route_status: "planned" | "in_progress" | "complete" | "returning"
      tote_status:
        | "empty_at_customer"
        | "in_transit"
        | "ready_to_stow"
        | "stored"
        | "pending_pick"
        | "picked"
        | "returned_to_station"
        | "error"
      user_role: "customer" | "driver" | "warehouse" | "sorter" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "failed_payment"],
      error_type: [
        "seal_mismatch",
        "force_complete",
        "partial_delivery",
        "unexpected_tote",
      ],
      pick_list_status: ["ready", "in_progress", "complete"],
      route_status: ["planned", "in_progress", "complete", "returning"],
      tote_status: [
        "empty_at_customer",
        "in_transit",
        "ready_to_stow",
        "stored",
        "pending_pick",
        "picked",
        "returned_to_station",
        "error",
      ],
      user_role: ["customer", "driver", "warehouse", "sorter", "admin"],
    },
  },
} as const

// ============================================================
// Tote Valet — convenience aliases (layered on the generated
// Database types above so app code doesn't spell out
// Database['public']['Tables'][...] everywhere). JSON columns
// (stops/bins/items/tote_ids) get their specific shape declared
// here since Postgres can't express it in the generated schema.
// ============================================================

export type UserRole = Database['public']['Enums']['user_role']
export type AccountStatus = Database['public']['Enums']['account_status']
export type ToteStatus = Database['public']['Enums']['tote_status']
export type RouteStatus = Database['public']['Enums']['route_status']
export type PickListStatus = Database['public']['Enums']['pick_list_status']
export type ErrorType = Database['public']['Enums']['error_type']

// Force Complete error codes (Section 6.4)
export type ForceCompleteCode =
  | 'FC-001'  // Scanner hardware failure
  | 'FC-002'  // Tote barcode unreadable/damaged
  | 'FC-003'  // Seal barcode unreadable/damaged
  | 'FC-004'  // App connectivity issue
  | 'FC-005'  // Customer present, totes handed over directly
  | 'FC-006'  // Time-critical situation, supervisor approved
  | 'FC-007'  // Other — see notes

export interface ToteItem {
  label: string
  photo_url?: string
  ai_generated?: boolean
}

export interface RouteStop {
  stop_number: number
  customer_id: string
  customer_name: string
  address: string
  type: 'pickup' | 'delivery'
  tote_ids: string[]
  // Delivery stops for generic/unassigned empty totes (e.g. a first-time
  // empty-tote delivery) don't have specific tote_ids yet at route-creation
  // time — this is how many the driver still needs to grab & scan at load
  // time. Decrements as tote_ids gets filled in; 0/undefined once fulfilled.
  expected_empty_count?: number
  seal_numbers?: string[]
  notes?: string
  completed: boolean
  force_completed: boolean
  error_id?: string
  // Persisted link back to the order (tote_requests row, or a legacy
  // pickup_requested tote flag) that produced this stop, if any — set at
  // route-creation time, read back when the stop completes so the order's
  // status/completed_at can update in step with the physical delivery.
  // Manually-added stops (no matching order) simply omit this.
  order_ref?: { source: 'tote_request' | 'pickup_flag'; sourceId: string }
}

export interface PickListTote {
  tote_id: string
  customer_name: string
  status: 'pending' | 'picked'
}

export interface PickListBin {
  bin_id: string
  totes: PickListTote[]
}

export type Customer = Database['public']['Tables']['customers']['Row']
export type Bin = Database['public']['Tables']['bins']['Row']
export type ToteError = Database['public']['Tables']['errors']['Row']
export type Tote = Database['public']['Tables']['totes']['Row']
export type Route = Database['public']['Tables']['routes']['Row']
export type PickList = Database['public']['Tables']['pick_lists']['Row']
export type Region = Database['public']['Tables']['regions']['Row']
export type DashboardThresholds = Database['public']['Tables']['dashboard_thresholds']['Row']
