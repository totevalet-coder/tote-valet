'use client'

import { Warehouse } from 'lucide-react'
import ComingSoon from '@/components/admin/ComingSoon'

export default function WarehouseSetupPage() {
  return (
    <ComingSoon
      title="Warehouse Setup"
      icon={Warehouse}
      phase="Phase 7"
      description="Bulk-create bin rows and drag-to-fill new bins. Day-to-day capacity overrides already live in Warehouse → Reports → Bins."
    />
  )
}
