'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ChevronLeft, Loader2, CheckCircle2, User, KeyRound } from 'lucide-react'
import type { Customer } from '@/types/database'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) { router.push('/login'); return }

      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_id', userData.user.id)
        .single()

      if (data) {
        setCustomer(data as Customer)
        setName(data.name ?? '')
        setPhone(data.phone ?? '')
        setAddress(data.address ?? '')
      }
      setLoading(false)
    }
    load()
  }, [supabase, router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: updateError } = await supabase
      .from('customers')
      .update({ name, phone, address })
      .eq('id', customer.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      // Also update auth metadata
      await supabase.auth.updateUser({ data: { full_name: name, phone } })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-brand-navy font-semibold text-sm"
      >
        <ChevronLeft className="w-5 h-5" />
        Back
      </button>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-brand-navy rounded-2xl flex items-center justify-center">
          <User className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-brand-navy">My Profile</h1>
          {customer && (
            <p className="text-gray-400 text-xs mt-0.5">Member since {new Date(customer.joined_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {saved && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Profile updated successfully!
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email"
              value={customer?.email ?? ''}
              disabled
              className="input-field bg-gray-50 text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-field"
              placeholder="(555) 000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Service Address</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="input-field"
              placeholder="123 Main St, City, State"
            />
          </div>

          {/* Account status */}
          {customer && (
            <div className="card bg-gray-50">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Account Status</span>
                <span className={`font-semibold capitalize ${
                  customer.status === 'active' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {customer.status}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-500">Role</span>
                <span className="font-semibold text-brand-navy capitalize">{customer.role}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>

          <Link
            href="/forgot-password"
            className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-bold hover:border-brand-navy hover:text-brand-navy transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </Link>
        </form>
      )}
    </div>
  )
}
