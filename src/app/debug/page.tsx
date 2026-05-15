'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DebugInfo {
  timestamp: string
  sessionResult: string
  sessionExpiry: string | null
  sessionRefreshExpiry: string | null
  getUserResult: string
  getUserError: string | null
  cookies: string[]
  localStorageKeys: string[]
  lsSessionPresent: boolean
  userAgent: string
  standalone: boolean
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color = ok === true ? 'text-green-700' : ok === false ? 'text-red-700' : 'text-gray-800'
  return (
    <div className="border-b border-gray-100 py-2">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-mono break-all ${color}`}>{value}</p>
    </div>
  )
}

export default function DebugPage() {
  const [info, setInfo] = useState<DebugInfo | null>(null)
  const [loading, setLoading] = useState(true)

  async function run() {
    setLoading(true)
    const supabase = createClient()

    // 1. getSession — reads from local storage/cookies, no network
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const session = sessionData?.session

    let sessionExpiry: string | null = null
    let sessionRefreshExpiry: string | null = null
    if (session) {
      sessionExpiry = new Date(session.expires_at! * 1000).toLocaleString()
      // refresh token doesn't have a JS-accessible expiry, but access token does
    }

    // 2. getUser — validates token with Supabase server
    const { data: userData, error: userError } = await supabase.auth.getUser()

    // 3. Cookies visible to JS
    const allCookies = document.cookie
      .split(';')
      .map(c => c.trim())
      .filter(Boolean)

    // 4. localStorage keys and tote-valet-auth value
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) lsKeys.push(k)
    }
    const lsSession = localStorage.getItem('tote-valet-auth')

    // 5. Standalone mode (PWA)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-ignore
      window.navigator.standalone === true

    setInfo({
      timestamp: new Date().toLocaleString(),
      sessionResult: session
        ? `✓ Session found (user: ${session.user.email})`
        : sessionError
        ? `✗ Error: ${sessionError.message}`
        : '✗ No session',
      sessionExpiry,
      sessionRefreshExpiry,
      getUserResult: userData.user
        ? `✓ User verified (${userData.user.email})`
        : `✗ No user returned`,
      getUserError: userError?.message ?? null,
      cookies: allCookies.length ? allCookies : ['(none visible)'],
      localStorageKeys: lsKeys.length ? lsKeys : ['(none)'],
      lsSessionPresent: !!lsSession,
      userAgent: navigator.userAgent,
      standalone,
    })
    setLoading(false)
  }

  useEffect(() => { run() }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-black text-gray-900">Auth Debug</h1>
          <button
            onClick={run}
            className="text-sm bg-brand-navy text-white px-3 py-1.5 rounded-lg font-semibold"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-brand-navy border-t-transparent animate-spin" />
          </div>
        ) : info ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 divide-y divide-gray-100">
            <Row label="Checked at" value={info.timestamp} />
            <Row
              label="PWA Standalone mode"
              value={info.standalone ? 'YES — running as PWA' : 'NO — running in browser tab'}
            />
            <Row
              label="getSession() — local read"
              value={info.sessionResult}
              ok={info.sessionResult.startsWith('✓')}
            />
            {info.sessionExpiry && (
              <Row label="Access token expires" value={info.sessionExpiry} />
            )}
            <Row
              label="getUser() — server verify"
              value={info.getUserResult}
              ok={info.getUserResult.startsWith('✓')}
            />
            {info.getUserError && (
              <Row label="getUser() error" value={info.getUserError} ok={false} />
            )}
            <div className="py-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                JS-readable cookies ({info.cookies.length})
              </p>
              {info.cookies.map((c, i) => (
                <p key={i} className="text-xs font-mono text-gray-700 break-all leading-5">
                  {c.length > 80 ? c.slice(0, 80) + '…' : c}
                </p>
              ))}
            </div>
            <div className="py-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                localStorage keys ({info.localStorageKeys.length})
              </p>
              {info.localStorageKeys.map((k, i) => (
                <p key={i} className="text-xs font-mono text-gray-700 break-all leading-5">{k}</p>
              ))}
            </div>
            <Row
              label="tote-valet-auth in localStorage"
              value={info.lsSessionPresent ? '✓ Session key found' : '✗ Not found'}
              ok={info.lsSessionPresent}
            />
            <div className="py-2 pb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">User agent</p>
              <p className="text-xs font-mono text-gray-600 break-all leading-5">{info.userAgent}</p>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-center text-gray-400 mt-4">
          Share a screenshot of this page for diagnosis
        </p>
      </div>
    </div>
  )
}
