import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Singleton — avoids creating a new client on every render
let _client: ReturnType<typeof createSupabaseClient<Database>> | undefined

export function createClient() {
  if (_client) return _client
  _client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'tote-valet-auth',
      },
    }
  )
  return _client
}
