import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Previously used a hand-rolled cookie/localStorage hybrid (real cookies for
// PKCE verifiers, session tokens copied into localStorage) to survive Chrome's
// "clear cookies on exit" setting. Confirmed broken 2026-08-08: Supabase
// splits large sessions across multiple cookie chunks, and the custom sync
// logic silently dropped one of the chunks, leaving every session
// unreconstructable -- login would succeed server-side and then immediately
// bounce back to the landing page. This had already been through several
// prior fix attempts without being fully resolved, so rather than patch the
// chunk-drop specifically, dropped the custom adapter entirely in favor of
// @supabase/ssr's own default cookie handling (real cookies, chunking
// handled internally by the library instead of by app code). Trade-off:
// sessions may not survive a browser fully clearing cookies on exit, but
// that's a narrower failure mode than login not working at all.
let _client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (_client) return _client

  // One-time cleanup of the old hybrid's leftover localStorage key — harmless
  // if left, but no reason to keep stale unused data around.
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('tv-session') } catch { /* ignore */ }
  }

  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )
  return _client
}
