import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const LS_KEY = 'tv-session'

type Cookie = { name: string; value: string }

function getAll(): Cookie[] {
  if (typeof window === 'undefined') return []

  // Auth session tokens from localStorage (survives browser restart)
  let stored: Cookie[] = []
  try {
    stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {}

  // PKCE code verifiers from sessionStorage (survives OAuth redirect within same tab)
  const pkce: Cookie[] = []
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.includes('code-verifier')) {
        pkce.push({ name: k, value: sessionStorage.getItem(k) ?? '' })
      }
    }
  } catch {}

  return [...stored, ...pkce]
}

function setAll(cookies: Cookie[]) {
  if (typeof window === 'undefined') return

  for (const { name, value } of cookies) {
    if (name.includes('code-verifier')) {
      // PKCE verifier only needs to survive the OAuth redirect
      if (value) {
        sessionStorage.setItem(name, value)
      } else {
        sessionStorage.removeItem(name)
      }
    } else {
      // Auth session tokens — merge into localStorage so we don't lose other keys
      let existing: Cookie[] = []
      try {
        existing = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
      } catch {}
      const without = existing.filter(c => c.name !== name)
      const updated = value ? [...without, { name, value }] : without
      localStorage.setItem(LS_KEY, JSON.stringify(updated))
    }
  }
}

let _client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll, setAll },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )
  return _client
}
