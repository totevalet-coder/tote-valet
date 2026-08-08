'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Bell, Truck, Package, ClipboardList, Navigation,
  AlertTriangle, Users, CreditCard, Settings, Warehouse, ShieldCheck,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: 'orders' | 'errors'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/admin',              label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/orders',       label: 'Orders',    icon: Bell,         badgeKey: 'orders' },
      { href: '/admin/inbound',      label: 'Inbound',   icon: Truck },
      { href: '/admin/totes',        label: 'Inventory', icon: Package },
      { href: '/admin/pick-lists',   label: 'Pick',      icon: ClipboardList },
      { href: '/admin/routes',       label: 'Routes',    icon: Navigation },
      { href: '/admin/errors',       label: 'Errors',    icon: AlertTriangle, badgeKey: 'errors' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Finance & Settings',
    items: [
      { href: '/admin/billing',          label: 'Finance',         icon: CreditCard },
      { href: '/admin/settings',         label: 'Settings',        icon: Settings },
      { href: '/admin/warehouse-setup',  label: 'Warehouse Setup', icon: Warehouse },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const [badges, setBadges] = useState<{ orders: number; errors: number }>({ orders: 0, errors: 0 })

  useEffect(() => {
    async function loadBadges() {
      const [requestsRes, pickupFlagsRes, errorsRes] = await Promise.all([
        supabase.from('tote_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('totes').select('id', { count: 'exact', head: true }).eq('pickup_requested', true),
        supabase.from('errors').select('id', { count: 'exact', head: true }).eq('resolved', false),
      ])
      setBadges({
        orders: (requestsRes.count ?? 0) + (pickupFlagsRes.count ?? 0),
        errors: errorsRes.count ?? 0,
      })
    }
    loadBadges()
  }, [supabase])

  function isActive(href: string) {
    return href === '/admin' ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-brand-navy text-white flex flex-col h-screen sticky top-0">
      {/* Branding */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4.5 h-4.5 text-brand-navy" />
        </div>
        <div className="leading-tight">
          <p className="font-black text-sm">Tote Valet</p>
          <p className="text-[10px] text-white/50 font-bold tracking-wider">OPERATIONS</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, badgeKey }) => {
                const active = isActive(href)
                const badgeValue = badgeKey ? badges[badgeKey] : 0
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{label}</span>
                    {badgeKey && badgeValue > 0 && (
                      <span className="text-[10px] font-bold bg-white/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        {badgeValue}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
