'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/types/database'
import { Search, UserPlus, ChevronRight, Users, DollarSign, AlertTriangle } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'
import { formatCurrency } from '@/lib/billing'
import { WAREHOUSE_POOL_CUSTOMER_ID } from '@/lib/warehousePool'

export default function AdminCustomersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filtered, setFiltered] = useState<Customer[]>([])
  const [toteCounts, setToteCounts] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [custRes, totesRes] = await Promise.all([
      supabase.from('customers').select('*').eq('role', 'customer').neq('id', WAREHOUSE_POOL_CUSTOMER_ID).order('name'),
      supabase.from('totes').select('customer_id'),
    ])
    if (custRes.data) { setCustomers(custRes.data as Customer[]); setFiltered(custRes.data as Customer[]) }

    const counts: Record<string, number> = {}
    for (const t of totesRes.data ?? []) counts[t.customer_id] = (counts[t.customer_id] ?? 0) + 1
    setToteCounts(counts)

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

  const totalMRR = customers.reduce((s, c) => s + (c.monthly_total ?? 0), 0)
  const failedCount = customers.filter(c => c.status === 'failed_payment').length

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Customers</h1>
        <button onClick={() => router.push('/admin/customers/new')}
          className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-blue-900 transition-colors">
          <UserPlus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Customers" value={customers.length} icon={Users} />
        <StatCard label="MRR" value={formatCurrency(totalMRR)} icon={DollarSign} valueColor="text-green-600" linkLabel="View in Finance" linkHref="/admin/billing" />
        <StatCard
          label="Failed Payments" value={failedCount} icon={AlertTriangle}
          valueColor={failedCount > 0 ? 'text-red-600' : 'text-brand-navy'}
          linkLabel="View in Errors" linkHref="/admin/errors"
        />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email, or address..."
          className="input-field pl-10" />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-12">No customers found.</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Address</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Totes</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Monthly</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/admin/customers/${c.id}`)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[10px] font-black">
                            {c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <span className="font-semibold text-brand-navy">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{c.email}</td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[220px]">{c.address ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{toteCounts[c.id] ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(c.monthly_total ?? 0)}/mo</td>
                    <td className="px-4 py-3">
                      <span className={`status-pill text-[10px] ${c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'failed_payment' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'active' ? 'Active' : c.status === 'failed_payment' ? 'Failed Payment' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
