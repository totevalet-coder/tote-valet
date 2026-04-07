'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Tote, UserRole } from '@/types/database'
import { ChevronLeft, Edit2, Package, FileText, StickyNote, Save } from 'lucide-react'
import AddressInput from '@/components/ui/AddressInput'

const ROLES: UserRole[] = ['customer', 'driver', 'warehouse', 'sorter', 'admin']

export default function CustomerDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [totes, setTotes] = useState<Tote[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ name: '', email: '', phone: '', address: '' })
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data: cust } = await supabase.from('customers').select('*').eq('id', id).single()
    if (!cust) { router.push('/admin/customers'); return }
    const c = cust as Customer
    setCustomer(c)
    setEditData({ name: c.name, email: c.email, phone: c.phone ?? '', address: c.address ?? '' })
    setSelectedRole(c.role)
    setNote(c.notes ?? '')

    const { data: t } = await supabase.from('totes').select('*').eq('customer_id', id)
    setTotes((t ?? []) as Tote[])
    setLoading(false)
  }, [supabase, id, router])

  useEffect(() => { load() }, [load])

  async function saveInfo() {
    setSaving(true)
    await supabase.from('customers').update(editData).eq('id', id)
    setMsg('Info saved.')
    setSaving(false)
    setEditing(false)
    load()
  }

  async function saveRole() {
    setSaving(true)
    await supabase.from('customers').update({ role: selectedRole }).eq('id', id)
    setMsg('Role updated.')
    setSaving(false)
    load()
  }

  async function saveNote() {
    setSaving(true)
    await supabase.from('customers').update({ notes: note }).eq('id', id)
    setMsg('Note saved.')
    setSaving(false)
    setShowNote(false)
    load()
  }

  async function suspendAccount() {
    if (!confirm('Suspend this account? The customer will lose access.')) return
    await supabase.from('customers').update({ status: 'suspended' }).eq('id', id)
    setMsg('Account suspended.')
    load()
  }

  async function activateAccount() {
    await supabase.from('customers').update({ status: 'active' }).eq('id', id)
    setMsg('Account reactivated.')
    load()
  }

  if (loading || !customer) {
    return <div className="px-5 pt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
  }

  const storedTotes = totes.filter(t => t.status === 'stored').length

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <button onClick={() => router.push('/admin/customers')} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700 font-semibold">
          {msg}
        </div>
      )}

      {/* Profile header */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <span className="font-black text-lg">{customer.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="font-black text-xl">{customer.name}</h1>
            <span className={`status-pill text-xs ${customer.status === 'active' ? 'bg-green-500/30 text-green-200' : 'bg-red-500/30 text-red-200'}`}>
              {customer.status}
            </span>
          </div>
        </div>
        <div className="space-y-1 text-sm text-white/70">
          <p>{customer.email}</p>
          {customer.phone && <p>{customer.phone}</p>}
          {customer.address && <p>{customer.address}</p>}
          <p className="text-white/50 text-xs">Joined {new Date(customer.joined_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Account summary */}
      <div className="card space-y-3">
        <h3 className="font-bold text-brand-navy text-sm">Account Summary</h3>
        {[
          { label: 'Totes Stored', value: storedTotes },
          { label: 'Monthly Charge', value: `$${(customer.monthly_total ?? 0).toFixed(2)}/mo` },
          { label: 'Free Exchanges Used', value: customer.free_exchanges_used },
          { label: 'Card on File', value: customer.card_on_file ? `•••• ${customer.card_on_file.slice(-4)}` : 'None' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-semibold text-brand-navy">{value}</span>
          </div>
        ))}
      </div>

      {/* Admin actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setEditing(!editing)}
          className="card flex items-center gap-2 justify-center py-3 text-sm font-semibold text-brand-navy hover:bg-gray-50 transition-colors">
          <Edit2 className="w-4 h-4" /> Edit Info
        </button>
        <button onClick={() => router.push(`/admin/customers/${id}/totes`)}
          className="card flex items-center gap-2 justify-center py-3 text-sm font-semibold text-brand-navy hover:bg-gray-50 transition-colors">
          <Package className="w-4 h-4" /> View Totes
        </button>
        <button onClick={() => router.push(`/admin/billing?customer=${id}`)}
          className="card flex items-center gap-2 justify-center py-3 text-sm font-semibold text-brand-navy hover:bg-gray-50 transition-colors">
          <FileText className="w-4 h-4" /> Billing
        </button>
        <button onClick={() => setShowNote(!showNote)}
          className="card flex items-center gap-2 justify-center py-3 text-sm font-semibold text-brand-navy hover:bg-gray-50 transition-colors">
          <StickyNote className="w-4 h-4" /> Add Note
        </button>
      </div>

      {/* Edit info form */}
      {editing && (
        <div className="card space-y-3">
          <h3 className="font-bold text-brand-navy text-sm">Edit Info</h3>
          {(['name', 'email', 'phone'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">{field}</label>
              <input type="text" value={editData[field]} onChange={e => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                className="input-field" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Service Address</label>
            <AddressInput
              value={editData.address}
              onChange={val => setEditData(prev => ({ ...prev, address: val }))}
              placeholder="123 Main St, City, State"
            />
          </div>
          <button onClick={saveInfo} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Add note */}
      {showNote && (
        <div className="card space-y-3">
          <h3 className="font-bold text-brand-navy text-sm">Admin Notes</h3>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
            placeholder="Internal notes about this customer..." className="input-field resize-none" />
          <button onClick={saveNote} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      )}

      {/* Role & Permissions */}
      <div className="card space-y-3">
        <h3 className="font-bold text-brand-navy text-sm">Role & Permissions</h3>
        <select value={selectedRole} onChange={e => setSelectedRole(e.target.value as UserRole)} className="input-field">
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <button onClick={saveRole} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-brand-navy text-white rounded-xl py-3 text-sm font-bold hover:bg-blue-900 transition-colors">
          <Save className="w-4 h-4" /> Save Role
        </button>
      </div>

      {/* Suspend / Activate */}
      {customer.status !== 'suspended' ? (
        <button onClick={suspendAccount}
          className="w-full border-2 border-red-300 text-red-600 rounded-2xl py-3 font-bold text-sm hover:bg-red-50 transition-colors">
          Suspend Account
        </button>
      ) : (
        <button onClick={activateAccount}
          className="w-full border-2 border-green-300 text-green-600 rounded-2xl py-3 font-bold text-sm hover:bg-green-50 transition-colors">
          Reactivate Account
        </button>
      )}
    </div>
  )
}
