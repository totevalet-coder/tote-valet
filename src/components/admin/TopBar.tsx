'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Eye, LogOut, ChevronDown } from 'lucide-react'
import { setViewAsRole, type ViewAsRole } from '@/lib/adminViewAs'

const VIEW_AS_OPTIONS: { role: ViewAsRole; label: string; desc: string; href: string }[] = [
  { role: 'driver',    label: 'Driver',    desc: 'Routes, stops, tote scanning',   href: '/driver' },
  { role: 'warehouse', label: 'Warehouse', desc: 'Scan & store, pick lists, sort', href: '/warehouse' },
  { role: 'sorter',    label: 'Sorter',    desc: 'Sort dept, staging, load routes', href: '/sorter' },
  { role: 'customer',  label: 'Customer',  desc: 'Dashboard, my items, billing',   href: '/dashboard' },
]

interface TopBarProps {
  adminName: string
  onSignOut: () => void
}

export default function TopBar({ adminName, onSignOut }: TopBarProps) {
  const router = useRouter()
  const [showViewAs, setShowViewAs] = useState(false)
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)

  const initials = adminName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'A'

  return (
    <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 gap-4 relative z-20">
      {/* Search — visual placeholder for now, not wired to real search yet */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search totes, bins, pick lists..."
          disabled
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-500 placeholder:text-gray-400 cursor-not-allowed"
        />
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {/* View As pill */}
        <div className="relative">
          <button
            onClick={() => setShowViewAs(v => !v)}
            className="flex items-center gap-1.5 border border-gray-200 rounded-full pl-3 pr-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> View As <ChevronDown className="w-3 h-3" />
          </button>
          {showViewAs && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowViewAs(false)} />
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                  Preview a portal
                </p>
                {VIEW_AS_OPTIONS.map(({ role, label, desc, href }) => (
                  <button
                    key={role}
                    onClick={() => { setViewAsRole(role); setShowViewAs(false); router.push(href) }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-semibold text-brand-navy">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Shift badge — display-only placeholder, no shift-schedule data model exists */}
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-3 py-1.5 whitespace-nowrap">
          Shift · 6:00a–2:00p
        </span>

        {/* Avatar + sign out */}
        <div className="relative">
          <button
            onClick={() => setShowAvatarMenu(v => !v)}
            className="w-9 h-9 rounded-full bg-brand-navy text-white flex items-center justify-center font-black text-xs flex-shrink-0"
          >
            {initials}
          </button>
          {showAvatarMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAvatarMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 p-1.5">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-brand-navy truncate">{adminName}</p>
                  <p className="text-xs text-gray-400">Admin</p>
                </div>
                <button
                  onClick={() => { setShowAvatarMenu(false); onSignOut() }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
