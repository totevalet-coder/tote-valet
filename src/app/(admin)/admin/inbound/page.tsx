'use client'

import { Truck } from 'lucide-react'
import ComingSoon from '@/components/admin/ComingSoon'

export default function InboundPage() {
  return (
    <ComingSoon
      title="Inbound"
      icon={Truck}
      phase="Phase 4"
      description="Drop zone status, who's stowing what, and today's inbound manifest by route."
    />
  )
}
