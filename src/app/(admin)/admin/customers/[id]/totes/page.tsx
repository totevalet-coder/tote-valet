'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Tote } from '@/types/database'
import ToteCard from '@/components/ui/ToteCard'
import { ChevronLeft } from 'lucide-react'

export default function CustomerTotesPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [totes, setTotes] = useState<Tote[]>([])
  const [customerName, setCustomerName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: cust } = await supabase.from('customers').select('name').eq('id', id).single()
    setCustomerName(cust?.name ?? '')
    const { data: t } = await supabase.from('totes').select('*').eq('customer_id', id).order('status')
    setTotes((t ?? []) as Tote[])
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="px-5 pt-6"><div className="h-32 bg-gray-200 rounded-2xl animate-pulse" /></div>

  return (
    <div className="px-5 pt-6 pb-6 space-y-4">
      <button onClick={() => router.push(`/admin/customers/${id}`)} className="flex items-center gap-2 text-gray-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> {customerName}
      </button>
      <h1 className="font-black text-2xl text-brand-navy">Totes</h1>
      {totes.length === 0
        ? <p className="text-center text-gray-400 text-sm py-8">No totes for this customer.</p>
        : totes.map(t => <ToteCard key={t.id} tote={t} />)
      }
    </div>
  )
}
