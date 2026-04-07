'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2, CheckCircle2, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (err) {
      setError(err.message)
    } else {
      setSent(true)
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
          <h1 className="text-2xl font-black text-white">Reset Password</h1>
          <p className="text-brand-blue text-sm mt-1">We&apos;ll send you a reset link</p>
        </div>

        <div className="px-8 py-8">
          <Link href="/login" className="flex items-center gap-1 text-gray-400 text-sm mb-6 hover:text-brand-navy transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Sign In
          </Link>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="font-black text-xl text-brand-navy mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm mb-1">We sent a reset link to</p>
              <p className="font-semibold text-brand-navy text-sm">{email}</p>
              <p className="text-gray-400 text-xs mt-4">
                Didn&apos;t receive it?{' '}
                <button onClick={() => setSent(false)} className="text-brand-blue font-semibold hover:underline">
                  Try again
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Reset Link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
