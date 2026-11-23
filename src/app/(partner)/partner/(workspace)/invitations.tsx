'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { answerInvitationAction } from './invitation-actions'

export type InvitationRow = { id: string; store: string; expires: string }

/** Clients › Invitations (approved mockup § Partner workspace): a store asks this partner to be its partner. */
export function Invitations({ rows }: { rows: InvitationRow[] }) {
  if (!rows.length) return null
  return (
    <Section flush ariaLabel="Invitations" className="mb-4">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1"><h2 className="font-semibold">Invitations</h2><Badge tone="neutral" className="tabular-nums">{String(rows.length)}</Badge></div>
      <ul data-list className="divide-y divide-border">{rows.map((r) => <Invitation key={r.id} row={r} />)}</ul>
    </Section>
  )
}

function Invitation({ row }: { row: InvitationRow }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const answer = (yes: boolean) => start(async () => {
    const r = await answerInvitationAction(row.id, yes)
    if (!r.ok) return setError(r.error)
    setOpen(null)
    toast.ok(yes ? `You are ${row.store}’s partner now.` : 'Invitation declined.')
    router.refresh()
  })
  const show = (k: 'accept' | 'decline') => { setError(null); setOpen(k) }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1"><p className="truncate font-medium">{row.store}</p><p className="text-sm text-muted-foreground">Expires {row.expires}</p></div>
      <span className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => show('decline')}>Decline invitation</Button>
        <Button size="sm" onClick={() => show('accept')}>Accept {row.store}</Button>
      </span>
      <Dialog open={open === 'accept'} onClose={() => setOpen(null)} error={error} title={`Become ${row.store}’s partner?`}
        description={<ul className="list-disc space-y-1 pl-5"><li>You and your Leads get Partner access to this store.</li><li>No revenue share on this store.</li><li>The owner can remove you at any time.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(null)}>Keep waiting</Button>
          <Button disabled={pending} onClick={() => answer(true)}>{pending ? 'Accepting…' : `Accept ${row.store}`}</Button>
        </>} />
      <Dialog open={open === 'decline'} onClose={() => setOpen(null)} error={error} title={`Decline ${row.store}?`}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(null)}>Keep invitation</Button>
          <Button variant="destructive" disabled={pending} onClick={() => answer(false)}>{pending ? 'Declining…' : 'Decline invitation'}</Button>
        </>} />
    </li>
  )
}
