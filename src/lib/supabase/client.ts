import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const LS_KEY = 'tv-session'

type Cookie = { name: string; value: string }

function readStoredCookies(): Cookie[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeStoredCookies(cookies: Cookie[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(cookies))
}

// Read Supabase tokens that the server set in document.cookie (e.g. after Google OAuth)
// and copy them into localStorage so they survive Chrome's "clear cookies on exit".
function syncServerCookiesToLocalStorage(stored: Cookie[]): Cookie[] {
  if (typeof document === 'undefined') return stored
  const storedNames = new Set(stored.map(c => c.name))
  const incoming: Cookie[] = []
  for (const raw of document.cookie.split(';')) {
    const eq = raw.indexOf('=')
    if (eq === -1) continue
    const name = raw.slice(0, eq).trim()
    const value = raw.slice(eq + 1).trim()
    if (name.startsWith('sb-') && !name.includes('code-verifier') && !storedNames.has(name)) {
      incoming.push({ name, value })
    }
  }
  if (incoming.length === 0) return stored
  const merged = [...stored, ...incoming]
  writeStoredCookies(merged)
  return merged
}

function getAll(): Cookie[] {
  if (typeof window === 'undefined') return []

  // Auth session tokens from localStorage (survives browser restart)
  let stored = readStoredCookies()

  // Sync any Supabase tokens the server set in cookies (Google OAuth callback)
  stored = syncServerCookiesToLocalStorage(stored)

  // PKCE code verifiers from sessionStorage (survives OAuth redirect, same tab only)
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
      // Auth session tokens — merge into localStorage one at a time
      const existing = readStoredCookies()
      const without = existing.filter(c => c.name !== name)
      const updated = value ? [...without, { name, value }] : without
      writeStoredCookies(updated)
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
