'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Package, CheckSquare, LogOut, Truck } from 'lucide-react'
import { useRoleGuard } from '@/lib/useRoleGuard'
import AdminViewingBanner from '@/components/ui/AdminViewingBanner'

const navItems = [
  { href: '/driver', label: 'Route', icon: MapPin, exact: true },
  { href: '/driver/load-truck', label: 'Load Truck', icon: Package, exact: false },
  { href: '/driver/end-route', label: 'End Route', icon: CheckSquare, exact: false },
]

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [driverName, setDriverName] = useState('Driver')
  const [showSignOut, setShowSignOut] = useState(false)
  const { checking } = useRoleGuard(['driver', 'admin'])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name =
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] ||
          'Driver'
        setDriverName(name)
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
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-brand-navy px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Truck className="w-4 h-4 text-brand-navy" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">Driver App</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/80 text-sm font-medium">
              {driverName.split(' ')[0]}
            </span>
            <button
              onClick={() => setShowSignOut(true)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="pb-24 min-h-screen">
          {children}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 z-50">
          <div className="flex items-center justify-around px-2 py-1">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl min-w-[80px] transition-colors duration-150 ${
                    active ? 'text-brand-navy' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className={`text-[10px] font-semibold ${active ? 'text-brand-navy' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Sign out confirm modal */}
        {showSignOut && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowSignOut(false)}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] bg-white rounded-2xl shadow-2xl z-50 p-6">
              <h3 className="font-bold text-brand-navy text-lg mb-2">Sign Out?</h3>
              <p className="text-gray-500 text-sm mb-5">
                Make sure you&apos;ve synced your route before signing out.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSignOut(false)}
                  className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-3 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex-1 bg-red-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
