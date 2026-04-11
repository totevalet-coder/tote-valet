'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/ui/BottomNav'
import { useRoleGuard } from '@/lib/useRoleGuard'
import {
  X,
  User,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Menu,
} from 'lucide-react'

const MENU_ITEMS = [
  { icon: User,       label: 'My Profile',        href: '/profile' },
  { icon: CreditCard, label: 'Billing & Invoice',  href: '/billing' },
  { icon: Bell,       label: 'Notifications',      href: '/notifications' },
  { icon: HelpCircle, label: 'Help & Support',     href: '/help' },
]

function HamburgerMenu({
  open,
  onClose,
  userName,
}: {
  open: boolean
  onClose: () => void
  userName: string
}) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 h-full w-72 max-w-[80vw] bg-white z-50 shadow-2xl flex flex-col">
        <div className="bg-brand-navy px-6 pt-12 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium">Logged in as</p>
              <p className="text-white font-bold text-base">{userName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {MENU_ITEMS.map(({ icon: Icon, label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-700 hover:bg-brand-navy/5 hover:text-brand-navy transition-colors group"
            >
              <Icon className="w-5 h-5 text-gray-400 group-hover:text-brand-blue" />
              <span className="font-semibold text-sm flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
            </Link>
          ))}
        </nav>

        <div className="px-4 pb-8 border-t border-gray-100 pt-4">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-semibold text-sm">Sign Out</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userName, setUserName] = useState('Customer')
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()
  const { checking } = useRoleGuard(['customer'])

  const loadUnread = useCallback(async (customerId: string) => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const name =
        data.user.user_metadata?.full_name ||
        data.user.email?.split('@')[0] ||
        'Customer'
      setUserName(name)

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_id', data.user.id)
        .single()
      if (customer) loadUnread(customer.id)
    })
  }, [supabase, loadUnread])

  if (checking) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-brand-navy border-t-transparent animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] relative">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-brand-navy px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-brand-navy text-xs font-black">TV</span>
            </div>
            <span className="text-white font-black text-lg tracking-tight">Tote Valet</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium mr-1">
              Hi, {userName.split(' ')[0]}
            </span>

            {/* Bell with unread badge */}
            <button
              onClick={() => router.push('/notifications')}
              className="relative w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-black flex items-center justify-center px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="pb-24 min-h-screen">
          {children}
        </main>

        <BottomNav />

        <HamburgerMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          userName={userName}
        />
      </div>
    </div>
  )
}
