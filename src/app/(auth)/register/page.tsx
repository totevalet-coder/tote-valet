'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2, CreditCard, CheckCircle2 } from 'lucide-react'

type Step = 1 | 2 | 3 | 'done'

interface OnboardingData {
  name: string
  phone: string
  address: string
  email: string
  password: string
  startingTotes: number
  firstPickupDate: string
}

const INITIAL_DATA: OnboardingData = {
  name: '', phone: '', address: '', email: '', password: '',
  startingTotes: 2, firstPickupDate: '',
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOAuth = searchParams.get('oauth') === 'true'
  const supabase = createClient()

  const [step, setStep] = useState<Step>(1)
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If coming from Google OAuth, pre-fill email from session
  useEffect(() => {
    if (isOAuth) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setData(prev => ({
            ...prev,
            email: user.email ?? '',
            name: user.user_metadata?.full_name ?? '',
          }))
        }
      })
    }
  }, [isOAuth])

  function update(field: keyof OnboardingData, value: string | number) {
    setData(prev => ({ ...prev, [field]: value }))
  }

  function nextStep() {
    setError(null)
    setStep(prev => prev === 1 ? 2 : prev === 2 ? 3 : prev)
  }

  function prevStep() {
    setError(null)
    setStep(prev => prev === 2 ? 1 : prev === 3 ? 2 : prev)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    try {
      let userId: string

      if (isOAuth) {
        // User already authenticated via Google — just get their ID
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Session expired. Please sign in again.')
        userId = user.id
      } else {
        // Email/password sign up
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: { data: { full_name: data.name, phone: data.phone } },
        })
        if (signUpError) throw signUpError
        if (!authData.user) throw new Error('Sign up failed. Please try again.')
        userId = authData.user.id
      }

      // Insert customer record
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          id: crypto.randomUUID(),
          auth_id: userId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          card_on_file: null,
          monthly_total: 0,
          status: 'active',
          role: 'customer',
          free_exchanges_used: 0,
          joined_date: new Date().toISOString().split('T')[0],
          notes: `Starting totes: ${data.startingTotes}. First pickup: ${data.firstPickupDate}`,
        })

      if (customerError) throw customerError

      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const stepLabels = ['Your Info', 'Payment', 'Choose Totes']
  const stepNum = step === 'done' ? 4 : (step as number)

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy p-4">
      <div className="w-full max-w-[430px] bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-brand-navy px-6 pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">
            {step !== 'done' && step !== 1 && (
              <button onClick={prevStep} className="text-white/70 hover:text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {step === 1 && !isOAuth && (
              <Link href="/login" className="text-white/70 hover:text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </Link>
            )}
            <div>
              <h1 className="text-xl font-black text-white">
                {isOAuth ? 'Complete Your Profile' : 'Create Account'}
              </h1>
              {step !== 'done' && (
                <p className="text-brand-blue text-xs mt-0.5">
                  Step {stepNum} of 3 — {stepLabels[stepNum - 1]}
                </p>
              )}
            </div>
          </div>
          {step !== 'done' && (
            <div className="flex gap-1.5">
              {[1, 2, 3].map(s => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  (step as number) >= s ? 'bg-brand-blue' : 'bg-white/20'
                }`} />
              ))}
            </div>
          )}
        </div>

        <div className="px-8 py-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Step 1: Personal info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-brand-navy">Tell us about yourself</h2>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                <input type="text" value={data.name} onChange={e => update('name', e.target.value)}
                  placeholder="Jane Smith" className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
                <input type="tel" value={data.phone} onChange={e => update('phone', e.target.value)}
                  placeholder="(555) 000-0000" className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Service Address</label>
                <input type="text" value={data.address} onChange={e => update('address', e.target.value)}
                  placeholder="123 Main St, Coopersburg, PA" className="input-field" />
              </div>

              {/* Only show email/password for non-OAuth signups */}
              {!isOAuth && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                    <input type="email" value={data.email} onChange={e => update('email', e.target.value)}
                      placeholder="you@example.com" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                    <input type="password" value={data.password} onChange={e => update('password', e.target.value)}
                      placeholder="At least 8 characters" minLength={8} className="input-field" />
                  </div>
                </>
              )}

              {isOAuth && (
                <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-brand-blue text-lg">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-brand-navy">Signed in with Google</p>
                    <p className="text-xs text-gray-500">{data.email}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (!data.name || !data.phone || !data.address) {
                    setError('Please fill in all fields.')
                    return
                  }
                  if (!isOAuth && (!data.email || !data.password)) {
                    setError('Please fill in all fields.')
                    return
                  }
                  if (!isOAuth && data.password.length < 8) {
                    setError('Password must be at least 8 characters.')
                    return
                  }
                  nextStep()
                }}
                className="btn-primary w-full mt-2"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Payment placeholder */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-brand-navy">Payment Setup</h2>
              <p className="text-sm text-gray-500">
                Your card will only be charged starting on your first pickup date.
              </p>
              <div className="bg-brand-blue/5 border-2 border-brand-blue/20 rounded-2xl p-5 text-center">
                <CreditCard className="w-10 h-10 text-brand-blue mx-auto mb-3" />
                <p className="text-brand-navy font-bold text-sm">Secure Payment via Stripe</p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Full payment setup will be added shortly. Billing activates on your first pickup — $15/tote/month.
                </p>
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                  <p className="text-yellow-700 text-xs font-medium">
                    Stripe integration coming soon — your spot is reserved!
                  </p>
                </div>
              </div>
              <div className="space-y-3 opacity-40 pointer-events-none select-none">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Card Number</label>
                  <input type="text" placeholder="•••• •••• •••• ••••" className="input-field" readOnly />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Expiry</label>
                    <input type="text" placeholder="MM / YY" className="input-field" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">CVV</label>
                    <input type="text" placeholder="•••" className="input-field" readOnly />
                  </div>
                </div>
              </div>
              <button onClick={nextStep} className="btn-primary w-full">Continue</button>
            </div>
          )}

          {/* Step 3: Totes & pickup date */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-brand-navy">Choose Your Setup</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">How many starting totes?</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} onClick={() => update('startingTotes', n)}
                      className={`py-4 rounded-xl border-2 font-bold text-lg transition-all duration-150 ${
                        data.startingTotes === n
                          ? 'border-brand-blue bg-brand-blue text-white shadow-md'
                          : 'border-gray-200 text-gray-700 hover:border-brand-blue'
                      }`}>
                      {n === 4 ? '4+' : n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  $15/mo per stored tote · $1/wk per empty tote at home
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preferred First Pickup Date</label>
                <input type="date" value={data.firstPickupDate} onChange={e => update('firstPickupDate', e.target.value)}
                  min={new Date().toISOString().split('T')[0]} className="input-field" />
              </div>
              <button
                onClick={() => {
                  if (!data.firstPickupDate) { setError('Please choose a pickup date.'); return }
                  handleSubmit()
                }}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Complete Sign Up
              </button>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-black text-brand-navy mb-2">You&apos;re all set!</h2>
              <p className="text-gray-500 text-sm mb-2">
                Welcome to Tote Valet, <strong>{data.name.split(' ')[0] || 'there'}</strong>!
              </p>
              <p className="text-gray-400 text-xs mb-6">
                Your first pickup is scheduled for{' '}
                {data.firstPickupDate
                  ? new Date(data.firstPickupDate + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })
                  : 'your chosen date'}.
              </p>
              <div className="bg-brand-navy/5 rounded-2xl p-4 mb-6 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Starting totes</span>
                  <span className="font-semibold text-brand-navy">{data.startingTotes}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Monthly storage</span>
                  <span className="font-semibold text-brand-navy">${(data.startingTotes * 15).toFixed(2)}/mo</span>
                </div>
              </div>
              <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">
                Go to My Dashboard
              </button>
            </div>
          )}

          {step !== 'done' && (
            <p className="text-center text-xs text-gray-400 mt-5">
              Already have an account?{' '}
              <Link href="/login" className="text-brand-blue font-semibold hover:underline">Sign In</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>}>
      <RegisterForm />
    </Suspense>
  )
}
