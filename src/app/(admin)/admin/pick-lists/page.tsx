'use client'

import { ClipboardList } from 'lucide-react'
import ComingSoon from '@/components/admin/ComingSoon'

export default function AdminPickListsPage() {
  return (
    <ComingSoon
      title="Pick"
      icon={ClipboardList}
      phase="Phase 4"
      description="Dispatcher view of today's pick lists, plus Generate Pick List and walk-time optimization."
    />
  )
}
