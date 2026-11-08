'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { restoreLookAction } from '../actions'

export function RestoreButton({ revisionId }: { revisionId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex items-center gap-2">
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await restoreLookAction({ revisionId }); if (!r.ok) setError(r.error); else router.push('/console/look/customize') })}>Restore</Button>
      {error && <span role="alert" className="text-danger-text">{error}</span>}
    </span>
  )
}
