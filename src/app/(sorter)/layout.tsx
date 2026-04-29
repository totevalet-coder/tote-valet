'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, ArrowLeftRight, Truck, LogOut } from 'lucide-react'
import { useRoleGuard } from '@/lib/useRoleGuard'
import AdminViewingBanner from '@/components/ui/AdminViewingBanner'

const navItems = [
  { href: '/sorter', label: 'Sort', icon: LayoutDashboard, exact: true },
  { href: '/sorter/staging', label: 'Staging', icon: ArrowLeftRight, exact: false },
  { href: '/sorter/load', label: 'Load', icon: Truck, exact: false },
]

export default function SorterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [staffName, setStaffName] = useState('Sorter')
  const [showSignOut, setShowSignOut] = useState(false)
  const { checking } = useRoleGuard(['sorter', 'admin'])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Sorter'
        setStaffName(name)
      }
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-brand-navy border-t-transparent animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] relative">
        <AdminViewingBanner />
        <header className="sticky top-0 z-30 bg-brand-navy px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4 text-brand-navy" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">Sort Dept</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/80 text-sm font-medium">{staffName.split(' ')[0]}</span>
            <button
              onClick={() => setShowSignOut(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="pb-24 min-h-screen">{children}</main>

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 z-50">
          <div className="flex items-center justify-around px-2 py-1">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link key={href} href={href}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl min-w-[80px] transition-colors ${active ? 'text-brand-navy' : 'text-gray-400'}`}
                >
                  <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className={`text-[10px] font-semibold ${active ? 'text-brand-navy' : 'text-gray-400'}`}>{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {showSignOut && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowSignOut(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] bg-white rounded-2xl shadow-2xl z-50 p-6">
              <h3 className="font-bold text-brand-navy text-lg mb-2">Sign Out?</h3>
              <p className="text-gray-500 text-sm mb-5">Any unsaved work will be lost.</p>
              <div className="flex gap-3">
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
