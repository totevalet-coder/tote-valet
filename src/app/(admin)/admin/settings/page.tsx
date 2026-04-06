'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Customer, UserRole } from '@/types/database'
import { Save, UserPlus, ChevronRight } from 'lucide-react'

type SettingsTab = 'pricing' | 'users' | 'notifications' | 'system'

const NOTIF_RULES = [
  { label: 'Tote Picked Up', desc: 'When driver picks up a tote', roles: ['Customer'] },
  { label: 'Tote Delivered', desc: 'When driver delivers a tote', roles: ['Customer'] },
  { label: 'Route Assigned', desc: 'When a route is assigned', roles: ['Driver'] },
  { label: 'Pick List Ready', desc: 'When a pick list is generated', roles: ['Warehouse'] },
  { label: 'Unstowed Past Cutoff', desc: 'Totes not stowed by 6 PM', roles: ['Warehouse', 'Admin'] },
  { label: 'Driver Error', desc: 'Force complete or seal mismatch', roles: ['Admin'] },
  { label: 'Failed Payment', desc: 'Card decline detected', roles: ['Admin'] },
  { label: 'New Sign-Up', desc: 'New customer registered', roles: ['Admin'] },
]

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [tab, setTab] = useState<SettingsTab>((searchParams.get('tab') as SettingsTab) ?? 'pricing')

  // Pricing state
  const [pricing, setPricing] = useState({ storageRate: '15.00', emptyFee: '1.00', freeExchanges: '2', gracePeriod: '30', missingToteCharge: '75.00', billingDay: '1' })
  const [pricingSaved, setPricingSaved] = useState(false)

  // Users state
  const [staff, setStaff] = useState<Customer[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)

  // Notifications toggles
  const [notifToggles, setNotifToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIF_RULES.map(r => [r.label, true]))
  )

  const loadStaff = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').neq('role', 'customer').order('name')
    setStaff((data ?? []) as Customer[])
    setLoadingStaff(false)
  }, [supabase])

  useEffect(() => { if (tab === 'users') loadStaff() }, [tab, loadStaff])

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    driver: 'bg-blue-100 text-blue-700',
    warehouse: 'bg-teal-100 text-teal-700',
    sorter: 'bg-indigo-100 text-indigo-700',
  }

  async function impersonate(role: string) {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    await supabase.from('customers').update({ role: role as UserRole }).eq('auth_id', userData.user.id)
    const routes: Record<string, string> = { customer: '/dashboard', driver: '/driver', warehouse: '/warehouse', sorter: '/sorter', admin: '/admin' }
    router.push(routes[role] ?? '/dashboard')
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'pricing', label: 'Pricing' },
    { id: 'users', label: 'Users' },
    { id: 'notifications', label: 'Alerts' },
    { id: 'system', label: 'System' },
  ]

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <h1 className="font-black text-2xl text-brand-navy">Settings</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all ${tab === t.id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pricing */}
      {tab === 'pricing' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Changes apply at next billing cycle.</p>
          {[
            { key: 'storageRate', label: 'Storage Rate (per tote/mo)', prefix: '$' },
            { key: 'emptyFee', label: 'Empty Tote Fee (per tote/wk)', prefix: '$' },
            { key: 'freeExchanges', label: 'Free Exchanges (per year)', prefix: '' },
            { key: 'gracePeriod', label: 'Grace Period (days)', prefix: '' },
            { key: 'missingToteCharge', label: 'Missing Tote Charge', prefix: '$' },
            { key: 'billingDay', label: 'Billing Day of Month', prefix: '' },
          ].map(({ key, label, prefix }) => (
            <div key={key}>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
              <div className="relative">
                {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">{prefix}</span>}
                <input type="number" value={pricing[key as keyof typeof pricing]}
                  onChange={e => setPricing(prev => ({ ...prev, [key]: e.target.value }))}
                  className={`input-field ${prefix ? 'pl-8' : ''}`} />
              </div>
            </div>
          ))}
          <button onClick={() => { setPricingSaved(true); setTimeout(() => setPricingSaved(false), 2000) }}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {pricingSaved ? 'Saved!' : 'Save Pricing'}
          </button>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-600">{staff.length} staff accounts</p>
            <button onClick={() => router.push('/admin/customers/new')}
              className="flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-3 py-2 text-sm font-bold">
              <UserPlus className="w-4 h-4" /> Add Staff
            </button>
          </div>
          {loadingStaff ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-2xl animate-pulse" />)}</div>
          ) : staff.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No staff accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {staff.map(s => (
                <button key={s.id} onClick={() => router.push(`/admin/customers/${s.id}`)}
                  className="card w-full text-left flex items-center gap-3 hover:shadow-md transition-all">
                  <div className="w-9 h-9 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-navy text-xs font-black">{s.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy text-sm truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  </div>
                  <span className={`status-pill text-xs ${ROLE_COLORS[s.role] ?? 'bg-gray-100 text-gray-500'}`}>{s.role}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && (
        <div className="space-y-3">
          {NOTIF_RULES.map(rule => (
            <div key={rule.label} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-navy text-sm">{rule.label}</p>
                <p className="text-xs text-gray-400">{rule.desc}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {rule.roles.map(r => (
                    <span key={r} className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-semibold">{r}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setNotifToggles(prev => ({ ...prev, [rule.label]: !prev[rule.label] }))}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${notifToggles[rule.label] ? 'bg-brand-blue' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifToggles[rule.label] ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* System */}
      {tab === 'system' && (
        <div className="space-y-5">
          {/* Role Impersonation */}
          <div className="card space-y-3">
            <h3 className="font-bold text-brand-navy text-sm">Role Impersonation (Testing)</h3>
            <p className="text-xs text-gray-400">Switch your account role to test different dashboards. You can switch back here.</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { role: 'customer', label: '👤 Customer', color: 'bg-gray-100 text-gray-700' },
                { role: 'driver', label: '🚐 Driver', color: 'bg-blue-100 text-blue-700' },
                { role: 'warehouse', label: '🏢 Warehouse', color: 'bg-teal-100 text-teal-700' },
                { role: 'sorter', label: '🔀 Sorter', color: 'bg-indigo-100 text-indigo-700' },
              ].map(({ role, label, color }) => (
                <button key={role} onClick={() => impersonate(role)}
                  className={`${color} rounded-xl py-3 text-sm font-bold hover:opacity-80 transition-opacity`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Database info */}
          <div className="card space-y-3">
            <h3 className="font-bold text-brand-navy text-sm">Database</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Last Backup</span>
                <span className="font-semibold text-brand-navy">Today, 3:00 AM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Provider</span>
                <span className="font-semibold text-brand-navy">Supabase</span>
              </div>
            </div>
            <button className="w-full border-2 border-brand-blue text-brand-blue rounded-xl py-3 text-sm font-bold hover:bg-blue-50 transition-colors">
              Export Backup
            </button>
          </div>

          {/* Danger zone */}
          <div className="card border-2 border-red-200 space-y-3">
            <h3 className="font-bold text-red-600 text-sm">Danger Zone</h3>
            <p className="text-xs text-gray-400">These actions cannot be undone. Use only in development/testing.</p>
            <button
              onClick={async () => {
                if (!confirm('Delete all test data? This cannot be undone.')) return
                await supabase.from('routes').delete().like('id', 'RT-%')
                alert('Test routes cleared.')
              }}
              className="w-full border-2 border-red-300 text-red-600 rounded-xl py-3 text-sm font-bold hover:bg-red-50 transition-colors">
              Clear Test Data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="px-5 pt-6"><div className="h-32 bg-gray-200 rounded-2xl animate-pulse" /></div>}>
      <SettingsContent />
    </Suspense>
  )
}
