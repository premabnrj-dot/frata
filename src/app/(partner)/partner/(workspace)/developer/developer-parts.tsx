'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import Link from 'next/link'
import { Button, button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { DEVICE_TERMINAL, startedWords } from '@/domains/storefront-api/device'
import { NO_PASSKEY_HERE } from '@/components/passkeys/passkey-client'
import { settle } from '@/lib/settle'
import type { CodeLook } from '@/lib/db/device-codes'
import { checkCodeAction, deleteComputerAction, giveOptionsAction, giveVerifyAction, type DeviceAnswer } from './actions'

// The page's words (four screens § 2 States), one line each; the reasons come from the actions.
type Why = Extract<DeviceAnswer<unknown>, { ok: false }>['why']
const SAY: Record<Why, string> = {
  bad_code: 'Type the 8 characters from your terminal.',
  ended: 'This code has ended. Run the command again for a new one.',
  busy: 'Too many tries. Wait a minute.',
  full: 'This store has its limit of keys. Delete one first.',
  no_passkey: 'Add a passkey to give a key.',
  not_confirmed: 'Not confirmed. Try again, or use your other passkey.',
  sign_in_again: 'Sign in again.',
  builder: 'Only a Partner owner or a Lead can sign in a computer.',
}
const fullFor = (store: string) => `${store} has its limit of keys. Delete one first.`

/** Sign in this computer: the code from the terminal, checked, then the confirm dialog. */
export function SignInComputer() {
  const router = useRouter()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [look, setLook] = useState<(CodeLook & { code: string; at: Date }) | null>(null)

  const check = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const r = await checkCodeAction(code).catch(() => ({ ok: false as const, why: 'busy' as const }))
    setBusy(false)
    if (!r.ok) { setError(SAY[r.why]); input.current?.focus(); return }
    setLook({ ...r.value, code: code.trim().toUpperCase(), at: new Date() }) // clock-ok: a click handler; "Started" counts from this check
  }
  const done = () => {
    setLook(null); setCode('')
    toast.ok(DEVICE_TERMINAL.done); settle(router)
    input.current?.focus() // the dialog is gone: back to the field, the toast says what happened
  }
  return (
    <form onSubmit={check} noValidate className="grid gap-3">
      <label className="grid gap-1.5">
        <span className="text-label">Code from your terminal</span>
        <input ref={input} name="code" value={code} onChange={(e) => { setCode(e.target.value); if (error) setError(null) }}
          className={`${FIELD} font-mono uppercase tracking-wider`} maxLength={12} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          inputMode="text" {...fieldProps('code', error)} />
      </label>
      <FieldError name="code" message={error} className="-mt-1.5" />
      <div><Button type="submit" size="sm" busy={busy}>Check code</Button></div>
      {look && <GiveKey look={look} onClose={() => { setLook(null); input.current?.focus() }} onDone={done} />}
    </form>
  )
}

/** The confirm dialog: the store, the code, when and where it started, the key; Give key asks for the passkey there and
 *  then, for this one key. From another network, Don't give key is the main button. */
function GiveKey({ look, onClose, onDone }: { look: CodeLook & { code: string; at: Date }; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const elsewhere = look.sameNetwork === false
  const off = look.full ? fullFor(look.store) : !look.hasPasskey ? SAY.no_passkey : undefined
  const give = async () => {
    setBusy(true); setError(null)
    const o = await giveOptionsAction(look.code).catch(() => ({ ok: false as const, why: 'busy' as const }))
    if (!o.ok) { setBusy(false); return setError(o.why === 'full' ? fullFor(look.store) : SAY[o.why]) }
    let response
    try { response = await startAuthentication({ optionsJSON: o.value as Parameters<typeof startAuthentication>[0]['optionsJSON'] }) } catch (e) {
      setBusy(false); return setError((e as Error)?.name === 'NotAllowedError' ? NO_PASSKEY_HERE : SAY.not_confirmed)
    }
    const r = await giveVerifyAction(look.code, response).catch(() => ({ ok: false as const, why: 'not_confirmed' as const }))
    setBusy(false)
    if (!r.ok) return setError(r.why === 'full' ? fullFor(look.store) : SAY[r.why])
    onDone()
  }
  const dont = <Button variant={elsewhere ? 'primary' : 'secondary'} data-autofocus onClick={onClose}>Don’t give key</Button>
  // No passkey at all (an undrawn state, orchestrator ruling 6): Give key off, and a way to add one.
  const add = !look.hasPasskey && <Link href="/partner/passkeys" className={button({ variant: 'secondary' })}>Add passkey</Link>
  const yes = <Button variant={elsewhere ? 'secondary' : 'primary'} busy={busy} disabled={!!off} reason={off} onClick={give}>Give key</Button>
  return (
    <Dialog open onClose={onClose} title="Give this computer a Build key?" error={error} actions={<>{dont}{add}{yes}</>}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Store</dt><dd className="font-medium">{look.store}</dd>
        <dt className="text-muted-foreground">Code</dt><dd className="font-mono">{look.code.replace(/^(\w{4})-?(\w{4})$/, '$1-$2')}</dd>
        <dt className="text-muted-foreground">Started</dt>
        <dd className="flex flex-wrap items-center gap-2">{startedWords(new Date(look.startedAt), look.at)}
          {look.sameNetwork === true && <Badge tone="ok">Your network</Badge>}
          {elsewhere && <Badge tone="warn">Another network</Badge>}</dd>
        {!elsewhere && <><dt className="text-muted-foreground">The key</dt><dd>Reads the store’s products, drafts too. Ends in 24 hours.</dd></>}
      </dl>
      {/* As drawn: the warning under the facts, just above the buttons. */}
      <p className="mt-3 text-sm text-muted-foreground">{elsewhere ? 'This code was not started from your network. Frrata never asks you for a code.' : 'Frrata never asks you for a code. Type only one from your own screen.'}</p>
    </Dialog>
  )
}

/** Delete key on Your computers: a confirm with the one consequence, then gone at once. */
export function DeleteComputer({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true); setError(null)
    const r = await deleteComputerAction(id).catch(() => ({ ok: false }))
    setBusy(false)
    if (!r.ok) return setError('We couldn’t delete that key. Nothing was changed. Try again.')
    setOpen(false); toast.ok('Key deleted.'); settle(router)
  }
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => { setError(null); setOpen(true) }}>Delete key</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this computer’s key?" description="That computer is signed out at once." error={error}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep key</Button>
          <Button variant="destructive" busy={busy} onClick={go}>Delete key</Button>
        </>} />
    </>
  )
}
