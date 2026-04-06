'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2 } from 'lucide-react'

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.email) { setError('Name and email are required.'); return }
    setSaving(true)
    setError('')

    const { error: err } = await supabase.from('customers').insert({
      id: crypto.randomUUID(),
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes || null,
      status: 'active',
      role: 'customer',
      monthly_total: 0,
      free_exchanges_used: 0,
      joined_date: new Date().toISOString().split('T')[0],
    })

    if (err) { setError(err.message); setSaving(false); return }
    router.push('/admin/customers')
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/admin/customers')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="font-black text-2xl text-brand-navy">Add Customer</h1>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {[
          { field: 'name', label: 'Full Name', type: 'text', required: true },
          { field: 'email', label: 'Email Address', type: 'email', required: true },
          { field: 'phone', label: 'Phone Number', type: 'tel', required: false },
          { field: 'address', label: 'Service Address', type: 'text', required: false },
        ].map(({ field, label, type, required }) => (
          <div key={field}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input type={type} value={form[field as keyof typeof form]}
              onChange={e => update(field as keyof typeof form, e.target.value)}
              className="input-field" />
          </div>
        ))}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Admin Notes</label>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
            className="input-field resize-none" placeholder="Starting totes, special instructions..." />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Creating...' : 'Create Customer'}
      </button>
    </div>
  )
}
