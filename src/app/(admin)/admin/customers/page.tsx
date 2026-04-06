'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/types/database'
import { Search, UserPlus, ChevronRight } from 'lucide-react'

export default function AdminCustomersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filtered, setFiltered] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('role', 'customer')
      .order('name')
    if (data) { setCustomers(data as Customer[]); setFiltered(data as Customer[]) }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = query.toLowerCase()
    if (!q) { setFiltered(customers); return }
    setFiltered(customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q)
    ))
  }, [query, customers])

  const totalMRR = filtered.reduce((s, c) => s + (c.monthly_total ?? 0), 0)

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Customers</h1>
        <button onClick={() => router.push('/admin/customers/new')}
          className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-3 py-2 text-sm font-bold hover:bg-blue-900 transition-colors">
          <UserPlus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email, or address..."
          className="input-field pl-10" />
      </div>

      {/* Summary */}
      <div className="flex gap-3">
        <div className="card flex-1 text-center py-3">
          <p className="font-black text-xl text-brand-navy">{filtered.length}</p>
          <p className="text-xs text-gray-500">Customers</p>
        </div>
        <div className="card flex-1 text-center py-3">
          <p className="font-black text-xl text-green-600">${totalMRR.toFixed(0)}/mo</p>
          <p className="text-xs text-gray-500">MRR</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(c => (
          <button key={c.id} onClick={() => router.push(`/admin/customers/${c.id}`)}
            className="card w-full text-left flex items-center gap-3 hover:shadow-md active:scale-[0.98] transition-all">
            <div className="w-10 h-10 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-black">{initials(c.name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-brand-navy text-sm truncate">{c.name}</p>
              <p className="text-xs text-gray-400 truncate">{c.address ?? c.email}</p>
              <p className="text-xs text-gray-400">${(c.monthly_total ?? 0).toFixed(2)}/mo</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`status-pill text-xs ${c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'failed_payment' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                {c.status === 'active' ? 'Active' : c.status === 'failed_payment' ? 'Failed Payment' : 'Suspended'}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No customers found.</p>
        )}
      </div>
    </div>
  )
}
