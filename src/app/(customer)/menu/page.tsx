'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  User, CreditCard, Bell, HelpCircle, ChevronRight, LogOut,
} from 'lucide-react'

const MENU_ITEMS = [
  { icon: User,       label: 'My Profile',       sub: 'Edit name, phone & address', href: '/profile' },
  { icon: CreditCard, label: 'Billing & Invoice', sub: 'View charges & payment method', href: '/billing' },
  { icon: Bell,       label: 'Notifications',     sub: 'View delivery updates', href: '/notifications' },
  { icon: HelpCircle, label: 'Help & Support',    sub: 'FAQ & contact info', href: '/help' },
]

export default function MenuPage() {
  const router = useRouter()
  const supabase = createClient()
  const [userName, setUserName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserName(
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] ||
          'Customer'
        )
      }
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {/* User hero */}
      <div className="bg-brand-navy rounded-2xl px-5 py-5 flex items-center gap-4">
        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xl font-black">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-white font-black text-lg leading-tight">{userName}</p>
          <p className="text-white/50 text-xs mt-0.5">Tote Valet Customer</p>
        </div>
      </div>

      {/* Nav items */}
      <div className="space-y-2">
        {MENU_ITEMS.map(({ icon: Icon, label, sub, href }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 hover:border-brand-blue hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-brand-navy text-sm">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </Link>
        ))}
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center gap-4 bg-red-50 border border-red-100 rounded-2xl px-5 py-4 hover:bg-red-100 active:scale-[0.98] transition-all"
      >
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <LogOut className="w-5 h-5 text-red-500" />
        </div>
        <span className="font-bold text-red-600 text-sm">Sign Out</span>
      </button>
    </div>
  )
}
