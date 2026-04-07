'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, CheckCheck, Package, Truck, AlertCircle, DollarSign } from 'lucide-react'

interface AppNotification {
  id: string
  customer_id: string
  title: string
  body: string
  type: string
  read: boolean
  created_at: string
}

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  tote_pickup:    { icon: Truck,         color: 'text-yellow-600', bg: 'bg-yellow-100' },
  tote_delivery:  { icon: Package,       color: 'text-brand-blue', bg: 'bg-blue-100' },
  failed_payment: { icon: DollarSign,    color: 'text-red-600',    bg: 'bg-red-100' },
  driver_error:   { icon: AlertCircle,   color: 'text-orange-600', bg: 'bg-orange-100' },
  general:        { icon: Bell,          color: 'text-gray-500',   bg: 'bg-gray-100' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationsPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_id', userData.user.id)
      .single()
    if (!customer) { setLoading(false); return }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(50)

    setNotifications((data ?? []) as AppNotification[])
    setLoading(false)

    // Mark all as read
    if (data && data.some(n => !n.read)) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('customer_id', customer.id)
        .eq('read', false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="px-5 pt-6 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-2xl text-brand-navy">Notifications</h1>
        {unread > 0 && (
          <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
            {unread} new
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-bold text-gray-400 text-lg">No notifications yet</p>
          <p className="text-gray-400 text-sm mt-1">You'll see updates about your totes here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const cfg = TYPE_ICON[n.type] ?? TYPE_ICON.general
            const Icon = cfg.icon
            return (
              <div key={n.id} className={`card flex items-start gap-3 ${!n.read ? 'border-l-4 border-brand-blue' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-bold ${n.read ? 'text-gray-700' : 'text-brand-navy'}`}>{n.title}</p>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-brand-blue flex-shrink-0 mt-2" />
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-gray-400">
            <CheckCheck className="w-4 h-4" />
            <span>All caught up</span>
          </div>
        </div>
      )}
    </div>
  )
}
