'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Bell, Truck, Package, ClipboardList, Navigation,
  AlertTriangle, Users, CreditCard, Settings, Warehouse,
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
        supabase.from('tote_requests').select('id, tote_ids').eq('status', 'pending'),
        supabase.from('totes').select('id').eq('pickup_requested', true),
        supabase.from('errors').select('id', { count: 'exact', head: true }).eq('resolved', false),
      ])
      const requests = requestsRes.data ?? []
      // Every current pickup flow flips pickup_requested=true AND inserts a
      // tote_requests row for the same totes in one action -- same order,
      // not two. Skip flagged totes already covered by a request so the
      // badge count matches what Orders actually shows, same dedupe as there.
      const requestedToteIds = new Set(requests.flatMap(r => r.tote_ids ?? []))
      const orphanedFlags = (pickupFlagsRes.data ?? []).filter(t => !requestedToteIds.has(t.id))
      setBadges({
        orders: requests.length + orphanedFlags.length,
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
        <div className="leading-tight">
          <Image src="/logo.svg" alt="Storage Valet" width={130} height={41} className="brightness-0 invert" priority />
          <p className="text-[10px] text-white/50 font-bold tracking-wider mt-0.5">OPERATIONS</p>
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
