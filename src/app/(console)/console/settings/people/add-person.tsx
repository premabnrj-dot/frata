'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { FIELD } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { ROLE_LABEL } from '@/domains/tenancy/roles'
import { ROLE_LINE, type GivenRole } from '@/domains/tenancy/people'
import { addPersonAction } from './people-actions'

type Choice = GivenRole | 'partner'

/** Settings › People › Add a person (approved mockup § Add a person): email, then the role by name with its one line.
 *  Roles the caller can't give are not offered; at the limit only Partner stays open. */
export function AddPerson({ roles, partnerOpen, gstOn, atLimit, room }: {
  roles: GivenRole[]; partnerOpen: boolean; gstOn: boolean; atLimit: boolean; room: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const choices: Choice[] = [...roles, ...(partnerOpen ? ['partner' as const] : [])]
  const usable = (c: Choice) => c === 'partner' || (!atLimit && (c !== 'accountant' || gstOn))
  const [role, setRole] = useState<Choice | null>(null)
  const pick = role && usable(role) ? role : choices.find(usable) ?? null
  const [error, setError] = useState<{ text: string; field?: 'email' } | null>(null)
  const [pending, start] = useTransition()
  if (!choices.length) return null
  const send = () => start(async () => {
    if (!pick) return
    const r = await addPersonAction({ email, role: pick })
    if (!r.ok) return setError({ text: r.error, field: r.field })
    setOpen(false); setEmail(''); setError(null); setRole(null)
    toast.ok(`Invitation sent to ${r.email}.`)
    router.refresh()
  })
  return (
    <>
      <Button size="sm" onClick={() => { setError(null); setOpen(true) }}>Add a person</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a person" error={error && !error.field ? error.text : null}
        actions={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !pick || !email.trim()} onClick={send}>{pending ? 'Sending…' : 'Send invitation'}</Button>
        </>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send() }}>
          {atLimit && room && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
              <span>{room}</span><Link href="/console/settings/billing" className="text-sm font-medium underline underline-offset-4">Change plan</Link>
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="person-email" className="block text-sm font-medium">Email</label>
            <input id="person-email" type="email" required autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }}
              aria-invalid={error?.field === 'email' || undefined} aria-describedby={error?.field === 'email' ? 'person-email-error' : undefined} className={`${FIELD} w-full`} />
            <FieldError id="person-email-error" message={error?.field === 'email' ? error.text : null} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Role</legend>
            {choices.map((c) => {
              const on = pick === c
              const ok = usable(c)
              const line = c === 'accountant' && !gstOn ? 'Turn on the GST app to add an Accountant.' : ROLE_LINE[c]
              return (
                <label key={c} className={`flex flex-col gap-0.5 rounded-mid border p-3 text-sm ${ok ? 'cursor-pointer' : 'opacity-55'} ${on ? 'border-ring bg-select' : 'border-border hover:bg-accent'}`}>
                  <span className="flex items-center gap-2"><input type="radio" name="person-role" checked={on} disabled={!ok} onChange={() => setRole(c)} /><b className="font-medium">{c === 'partner' ? 'Partner' : ROLE_LABEL[c]}</b></span>
                  <span className="text-small text-muted-foreground">{line}</span>
                </label>
              )
            })}
          </fieldset>
          {pick === 'partner' && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>After they accept, they see your orders and shoppers’ names, phones and addresses.</li>
              <li>No revenue share. Your Frrata fee stays the same.</li>
            </ul>
          )}
        </form>
      </Dialog>
    </>
  )
}
