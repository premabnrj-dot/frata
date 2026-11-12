'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { inviteShopAccountant, removeShopAccountant, revokeShopAccountantInvite } from './actions'

/** Settings › People › Accountant (GST plan phase 3): invite your CA by email; they see GST and documents only. */
export function AccountantCard({ member, invites, consoleUrl }: { member: { userId: string; email: string | null } | null; invites: { id: string; email: string; expires: string }[]; consoleUrl: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const toast = useToast()
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    const r = await fn()
    if (r.ok) { toast.ok(done); setEmail(''); router.refresh() } else toast.error(r.error ?? 'Nothing was changed.')
  })
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Accountant</h2><span className="text-xs text-muted-foreground">GST and documents only</span></div>
      {member ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{member.email}</span>
          <Button variant="secondary" disabled={pending} onClick={() => act(() => removeShopAccountant(member.userId), 'Removed.')}>Remove</Button>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => inviteShopAccountant(email), `Invited. They sign in at ${consoleUrl} with ${email}.`) }}>
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="acc-email" className="block text-sm font-medium">Email</label>
            <input id="acc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm md:h-9" />
          </div>
          <Button type="submit" disabled={pending || !email.trim()}>{pending ? 'Inviting…' : 'Invite'}</Button>
        </form>
      )}
      {invites.length > 0 && (
        <ul className="space-y-1 text-sm">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2"><span className="font-mono">{i.email}</span><span className="text-xs text-muted-foreground">invited · until {i.expires}</span>
              <button type="button" disabled={pending} onClick={() => act(() => revokeShopAccountantInvite(i.id), 'Invite cancelled.')} className="ml-auto text-sm underline underline-offset-4">Cancel invite</button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
