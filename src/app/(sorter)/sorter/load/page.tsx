'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoadIndexPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/sorter/staging') }, [router])
  return null
}
