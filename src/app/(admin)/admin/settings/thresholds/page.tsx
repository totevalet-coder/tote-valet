'use client'

import { SlidersHorizontal } from 'lucide-react'
import ComingSoon from '@/components/admin/ComingSoon'

export default function ThresholdsPage() {
  return (
    <ComingSoon
      title="Dashboard Alert Thresholds"
      icon={SlidersHorizontal}
      phase="Phase 6"
      description="Warn/critical values for every Dashboard stat — applies to every operations dashboard immediately, no per-user settings."
    />
  )
}
