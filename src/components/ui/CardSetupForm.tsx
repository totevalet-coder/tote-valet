'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Loader2, Lock } from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

export interface CardSetupResult {
  paymentMethodId: string
  stripeCustomerId: string
}

interface CardSetupFormProps {
  // For existing customers
  customerId?: string
  // For new customers during registration
  customerEmail?: string
  customerName?: string
  onSuccess: (result: CardSetupResult) => void
  onCancel?: () => void
  submitLabel?: string
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1e3a5f',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#dc2626', iconColor: '#dc2626' },
  },
}

function CardForm({ customerId, customerEmail, customerName, onSuccess, onCancel, submitLabel }: CardSetupFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState('')
  const [stripeCustomerId, setStripeCustomerId] = useState('')
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/stripe/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, customerEmail, customerName }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
          setStripeCustomerId(data.stripeCustomerId)
        } else {
          setError(data.error ?? 'Failed to initialize payment')
        }
        setFetching(false)
      })
      .catch(() => { setError('Network error'); setFetching(false) })
  }, [customerId, customerEmail, customerName])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setLoading(true)
    setError(null)

    const card = elements.getElement(CardElement)
    if (!card) return

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card },
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Card setup failed')
      setLoading(false)
      return
    }

    const pmId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id ?? ''

    onSuccess({ paymentMethodId: pmId, stripeCustomerId })
    setLoading(false)
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-brand-blue transition-colors">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        Secured by Stripe. Your card details are never stored on our servers.
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 border-2 border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-bold hover:border-gray-300 transition-colors">
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading || !stripe || !clientSecret}
          className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Saving…' : (submitLabel ?? 'Save Card')}
        </button>
      </div>
    </form>
  )
}

export default function CardSetupForm(props: CardSetupFormProps) {
  return (
    <Elements stripe={stripePromise}>
      <CardForm {...props} />
    </Elements>
  )
}
