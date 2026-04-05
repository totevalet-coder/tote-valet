'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PlusCircle, Package, Menu } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/add-items', label: '+ Add Items', icon: PlusCircle },
  { href: '/my-items', label: 'My Items', icon: Package },
  { href: '/menu', label: 'Menu', icon: Menu },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around px-2 py-1 pb-safe">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[64px] transition-colors duration-150 ${
                active ? 'text-brand-navy' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon
                className={`w-6 h-6 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`}
              />
              <span className={`text-[10px] font-semibold ${active ? 'text-brand-navy' : 'text-gray-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
