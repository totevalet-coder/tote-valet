'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRoleGuard } from '@/lib/useRoleGuard'
import Sidebar from '@/components/admin/Sidebar'
import TopBar from '@/components/admin/TopBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()
  const [adminName, setAdminName] = useState('Admin')
  const [showSignOut, setShowSignOut] = useState(false)
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

  if (checking) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-navy border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar adminName={adminName} onSignOut={() => setShowSignOut(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Sign out confirm */}
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
  )
}
