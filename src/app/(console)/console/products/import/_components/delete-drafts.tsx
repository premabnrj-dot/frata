'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { deleteImportDrafts } from '../actions'

/** "Delete this import's drafts" on its history row: a confirm, since it can't be undone. */
export function DeleteDrafts({ jobId, fileName }: { jobId: string; fileName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [said, setSaid] = useState<string | null>(null)
  const go = () => start(async () => {
    const r = await deleteImportDrafts(jobId)
    setOpen(false)
    setSaid(r.ok ? (r.kept ? `${r.deleted} deleted · ${r.kept} kept: live or ordered` : `${r.deleted} deleted`) : r.error)
    router.refresh()
  })
  return (
    <>
      {said ? <span role="status" className="text-xs text-muted-foreground">{said}</span>
        : <Button variant="ghost" size="wrap" onClick={() => setOpen(true)}>Delete drafts</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete the drafts from ${fileName}?`}
        description="Drafts never published or ordered are deleted with their photos. This can’t be undone."
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep the drafts</Button>
          <Button variant="destructive" onClick={go} disabled={pending}>Delete drafts</Button>
        </>} />
    </>
  )
}
