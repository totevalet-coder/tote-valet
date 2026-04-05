'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/ui/BottomNav'
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
  { icon: User, label: 'My Profile', href: '/profile' },
  { icon: CreditCard, label: 'Billing & Invoice', href: '/billing' },
  { icon: Bell, label: 'Notifications', href: '/notifications' },
  { icon: HelpCircle, label: 'Help & Support', href: '/help' },
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-72 max-w-[80vw] bg-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
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

        {/* Nav items */}
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

        {/* Sign out */}
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [userName, setUserName] = useState('Customer')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name =
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] ||
          'Customer'
        setUserName(name)
      }
    })
  }, [supabase])

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
          <div className="flex items-center gap-3">
            <span className="text-white/80 text-sm font-medium">
              Hi, {userName.split(' ')[0]}
            </span>
            <button
              onClick={() => setMenuOpen(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="pb-24 min-h-screen">
          {children}
        </main>

        {/* Bottom nav */}
        <BottomNav />

        {/* Hamburger drawer */}
        <HamburgerMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          userName={userName}
        />
      </div>
    </div>
  )
}
