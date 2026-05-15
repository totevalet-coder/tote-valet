import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const LS_KEY = 'tv-session'

function lsGet(): Array<{ name: string; value: string }> {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function lsSet(cookies: Array<{ name: string; value: string }>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, JSON.stringify(cookies.map(({ name, value }) => ({ name, value }))))
}

let _client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: lsGet,
        setAll: lsSet,
      },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )
  return _client
}
