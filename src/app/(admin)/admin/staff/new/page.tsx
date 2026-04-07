'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Loader2 } from 'lucide-react'

const ROLES = [
  { value: 'driver',    label: '🚐 Driver',    desc: 'Delivery routes & stop scans' },
  { value: 'warehouse', label: '🏢 Warehouse', desc: 'Receive, stow, pick lists' },
  { value: 'sorter',    label: '🔀 Sorter',    desc: 'Sort department access' },
  { value: 'admin',     label: '🛡️ Admin',     label2: 'Admin',  desc: 'Full admin access' },
]

export default function NewStaffPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.email) { setError('Name and email are required.'); return }
    if (!form.role) { setError('Please select a role.'); return }
    setSaving(true)
    setError('')

    const { error: err } = await supabase.from('customers').insert({
      id: crypto.randomUUID(),
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      status: 'active',
      role: form.role,
      monthly_total: 0,
      free_exchanges_used: 0,
      joined_date: new Date().toISOString().split('T')[0],
    })

    if (err) { setError(err.message); setSaving(false); return }
    router.push('/admin/settings?tab=users')
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/admin/settings?tab=users')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Users
      </button>
      <h1 className="font-black text-2xl text-brand-navy">Add Staff</h1>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {/* Role picker */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Role <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(r => (
              <button key={r.value} type="button" onClick={() => update('role', r.value)}
                className={`rounded-xl p-3 text-left border-2 transition-all ${
                  form.role === r.value
                    ? 'border-brand-navy bg-brand-navy/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                <p className={`text-sm font-bold ${form.role === r.value ? 'text-brand-navy' : 'text-gray-700'}`}>{r.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name}
            onChange={e => update('name', e.target.value)}
            className="input-field" placeholder="Jane Smith" />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input type="email" value={form.email}
            onChange={e => update('email', e.target.value)}
            className="input-field" placeholder="jane@example.com" />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
          <input type="tel" value={form.phone}
            onChange={e => update('phone', e.target.value)}
            className="input-field" placeholder="(555) 000-0000" />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Creating...' : 'Create Staff Account'}
      </button>
    </div>
  )
}
