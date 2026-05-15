import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const LS_KEY = 'tv-session'

type Cookie = { name: string; value: string }

function readLS(): Cookie[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function writeLS(cookies: Cookie[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(cookies))
}

function readBrowserCookie(name: string): string | null {
  for (const raw of document.cookie.split(';')) {
    const eq = raw.indexOf('=')
    if (eq === -1) continue
    if (raw.slice(0, eq).trim() === name) return raw.slice(eq + 1).trim()
  }
  return null
}

function writeBrowserCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`
}

function deleteBrowserCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`
}

// After Google OAuth, the server stores session tokens in real cookies.
// Sync those into localStorage so they survive Chrome's "clear cookies on exit".
function syncServerSessionToLS(stored: Cookie[]): Cookie[] {
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
  writeLS(merged)
  return merged
}

function getAll(): Cookie[] {
  if (typeof window === 'undefined') return []

  // Session tokens from localStorage (persists across browser restarts)
  let stored = readLS()
  stored = syncServerSessionToLS(stored)

  // PKCE code verifiers from real browser cookies — server needs to read these
  // during the OAuth callback. Session cookies (no max-age) survive the redirect.
  const pkce: Cookie[] = []
  for (const raw of document.cookie.split(';')) {
    const eq = raw.indexOf('=')
    if (eq === -1) continue
    const name = raw.slice(0, eq).trim()
    const value = raw.slice(eq + 1).trim()
    if (name.includes('code-verifier')) pkce.push({ name, value })
  }

  return [...stored, ...pkce]
}

function setAll(cookies: Cookie[]) {
  if (typeof window === 'undefined') return

  for (const { name, value } of cookies) {
    if (name.includes('code-verifier')) {
      // Must live in real cookies — server reads them during OAuth code exchange
      if (value) writeBrowserCookie(name, value)
      else deleteBrowserCookie(name)
    } else {
      // Session tokens → localStorage (survives "clear cookies on exit")
      const existing = readLS()
      const without = existing.filter(c => c.name !== name)
      writeLS(value ? [...without, { name, value }] : without)
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
