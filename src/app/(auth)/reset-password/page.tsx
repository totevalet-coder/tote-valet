'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Suspense } from 'react'

function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Implicit flow: token arrives as URL hash #access_token=...&type=recovery
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (type === 'recovery' && accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) setError('Reset link is invalid or expired. Please request a new one.')
          else setReady(true)
        })
    } else {
      // Fallback: listen for event (handles edge cases)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setReady(true)
      })
      return () => subscription.unsubscribe()
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
    } else {
      setDone(true)
      // Route to correct portal based on role
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: customer } = await supabase.from('customers').select('role').eq('auth_id', user.id).single()
        const dest = { admin: '/admin', driver: '/driver', warehouse: '/warehouse', sorter: '/sorter' }[customer?.role ?? ''] ?? '/dashboard'
        setTimeout(() => router.push(dest), 2000)
      } else {
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy p-4">
      <div className="w-full max-w-[430px] bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-brand-navy px-8 pt-10 pb-8 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-brand-navy text-3xl font-black">TV</span>
          </div>
          <h1 className="text-2xl font-black text-white">New Password</h1>
          <p className="text-brand-blue text-sm mt-1">Choose a strong password</p>
        </div>

        <div className="px-8 py-8">
          {done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="font-black text-xl text-brand-navy mb-2">Password Updated!</h2>
              <p className="text-gray-500 text-sm">Redirecting you to your dashboard…</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Verifying reset link…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    className="input-field pr-11"
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  className="input-field"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-brand-navy">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
