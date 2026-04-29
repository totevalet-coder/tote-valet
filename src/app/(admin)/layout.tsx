'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Navigation, Radio, AlertTriangle,
  CreditCard, Settings, UserPlus, ChevronRight,
  LogOut, ShieldCheck, Eye, X, MoreHorizontal
} from 'lucide-react'
import { useRoleGuard } from '@/lib/useRoleGuard'
import { setViewAsRole, type ViewAsRole } from '@/lib/adminViewAs'

// ── Bottom nav — 5 most-used items ────────────────────────────────────────────
const navItems = [
  { href: '/admin',          label: 'Home',      icon: LayoutDashboard, exact: true  },
  { href: '/admin/customers',label: 'Customers', icon: Users,           exact: false },
  { href: '/admin/routes',   label: 'Routes',    icon: Navigation,      exact: false },
  { href: '/admin/monitor',  label: 'Monitor',   icon: Radio,           exact: false },
]

// ── More menu — every admin page, grouped ─────────────────────────────────────
const moreGroups = [
  {
    label: 'Operations',
    items: [
      { href: '/admin',           label: 'Dashboard',     icon: LayoutDashboard, desc: 'Stats, alerts, quick actions' },
      { href: '/admin/monitor',   label: 'Live Monitor',  icon: Radio,           desc: 'Real-time route progress' },
      { href: '/admin/routes',    label: 'Routes',        icon: Navigation,      desc: 'Create & view all routes' },
      { href: '/admin/errors',    label: 'Driver Errors', icon: AlertTriangle,   desc: 'Review & resolve flags' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/admin/customers',     label: 'Customer List',   icon: Users,    desc: 'Search & manage customers' },
      { href: '/admin/customers/new', label: 'Add Customer',    icon: UserPlus, desc: 'Create a new customer account' },
    ],
  },
  {
    label: 'Finance & Settings',
    items: [
      { href: '/admin/billing',  label: 'Billing',   icon: CreditCard, desc: 'Monthly billing overview' },
      { href: '/admin/settings', label: 'Settings',  icon: Settings,   desc: 'App configuration' },
      { href: '/admin/staff/new',label: 'Add Staff',  icon: UserPlus,   desc: 'Create driver / warehouse / sorter account' },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [adminName, setAdminName] = useState('Admin')
  const [showSignOut, setShowSignOut] = useState(false)
  const [showViewAs, setShowViewAs] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const { checking } = useRoleGuard(['admin'])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Admin'
        setAdminName(name)
      }
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // More menu is "active" when on a page not in the main nav
  const mainNavHrefs = navItems.map(n => n.href)
  const moreActive = !mainNavHrefs.some(href =>
    href === '/admin' ? pathname === href : pathname.startsWith(href)
  )

  if (checking) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-navy border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] relative">

        {/* ── Top bar ── */}
        <header className="sticky top-0 z-30 bg-brand-navy px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-brand-navy" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium">{adminName.split(' ')[0]}</span>
            <button onClick={() => setShowViewAs(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              title="View as role">
              <Eye className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSignOut(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="pb-24 min-h-screen">{children}</main>

        {/* ── Bottom nav ── */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 z-50">
          <div className="flex items-center justify-around px-1 py-1">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link key={href} href={href}
                  className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl min-w-[58px] transition-colors ${active ? 'text-brand-navy' : 'text-gray-400'}`}>
                  <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className={`text-[10px] font-semibold ${active ? 'text-brand-navy' : 'text-gray-400'}`}>{label}</span>
                </Link>
              )
            })}

            {/* More button */}
            <button
              onClick={() => setShowMore(true)}
              className={`flex flex-col items-center gap-1 px-1 py-2 rounded-xl min-w-[58px] transition-colors ${moreActive ? 'text-brand-navy' : 'text-gray-400'}`}
            >
              <MoreHorizontal className={`w-6 h-6 ${moreActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
              <span className={`text-[10px] font-semibold ${moreActive ? 'text-brand-navy' : 'text-gray-400'}`}>More</span>
            </button>
          </div>
        </nav>

        {/* ── More menu ── */}
        {showMore && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowMore(false)} />
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 flex flex-col max-h-[80vh]">
              {/* Handle + header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <h3 className="font-black text-brand-navy text-lg">All Pages</h3>
                <button onClick={() => setShowMore(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Scrollable list */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5 pb-8">
                {moreGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
                      {group.label}
                    </p>
                    <div className="space-y-1">
                      {group.items.map(({ href, label, icon: Icon, desc }) => {
                        const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
                        return (
                          <button
                            key={href}
                            onClick={() => { setShowMore(false); router.push(href) }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left ${
                              active ? 'bg-brand-navy/5' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              active ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-bold text-sm ${active ? 'text-brand-navy' : 'text-gray-700'}`}>{label}</p>
                              <p className="text-xs text-gray-400">{desc}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── View As modal ── */}
        {showViewAs && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowViewAs(false)} />
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-brand-navy text-lg">View As Role</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Opens that portal. Tap Exit to return.</p>
                </div>
                <button onClick={() => setShowViewAs(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-2">
                {([
                  { role: 'driver',    label: 'Driver',    desc: 'Routes, stops, tote scanning',    href: '/driver',    color: 'bg-blue-50 border-blue-200 text-blue-700' },
                  { role: 'warehouse', label: 'Warehouse', desc: 'Scan & store, pick lists, sort',   href: '/warehouse', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                  { role: 'sorter',    label: 'Sorter',    desc: 'Sort dept, staging, load routes',  href: '/sorter',    color: 'bg-green-50 border-green-200 text-green-700' },
                  { role: 'customer',  label: 'Customer',  desc: 'Dashboard, my items, billing',     href: '/dashboard', color: 'bg-orange-50 border-orange-200 text-orange-700' },
                ] as { role: ViewAsRole; label: string; desc: string; href: string; color: string }[]).map(({ role, label, desc, href, color }) => (
                  <button
                    key={role}
                    onClick={() => { setViewAsRole(role); setShowViewAs(false); router.push(href) }}
                    className={`w-full text-left border-2 rounded-2xl px-4 py-3.5 transition-colors hover:opacity-80 ${color}`}
                  >
                    <p className="font-bold text-sm">{label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Sign out modal ── */}
        {showSignOut && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowSignOut(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] bg-white rounded-2xl shadow-2xl z-50 p-6">
              <h3 className="font-bold text-brand-navy text-lg mb-2">Sign Out?</h3>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowSignOut(false)} className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-3 font-semibold text-sm">Cancel</button>
                <button onClick={handleSignOut} className="flex-1 bg-red-600 text-white rounded-xl py-3 font-semibold text-sm">Sign Out</button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
