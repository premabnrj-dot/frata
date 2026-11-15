'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { dateTimeIN } from '@/lib/format-date'
import { deviceLabel } from '@/domains/partners/passkeys'
import { passkeyClient } from './passkey-client'
import { JoinSteps, PasskeyTile, ReadCode } from './partner-frame'
import type { GateState } from './types'

// =============================================================================
// FILE: src/components/passkeys/partner-gate.tsx — what a partner person sees instead of the workspace until this
// browser session passes a passkey check (T1b; partner sign-in mockup https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ,
// screens 5, 7, 8, 9, 11, 14, 19, 21). With a passkey: "Confirm it's you". Without one, or with "Can't use your
// passkey?": a code to read to the partner's owner (a Lead) or to Frrata (the owner), shown at once; once approved,
// "Create a passkey" on this device. A code lives only in this tab (the database keeps its hash), so a reload shows it
// again from sessionStorage, or asks for a new one. A failure is an error toast (§ Feedback 1).
// =============================================================================

export type GateProps = {
  state: (GateState & { role: 'owner' | 'lead'; request: (GateState['request'] & { declined?: boolean }) | null }) | null
  /** Who approves a Lead: the partner's owner's first name ("Pia"). */
  ownerName: string
  /** The owner's phone on file, masked ("+91 98450 •••21"): Frrata calls it. */
  phone: string | null
  signOut: React.ReactNode
}

const { addPasskey, call, confirmPasskey } = passkeyClient('/partner/passkey')
type Code = { code: string; expiresAt: string; opensAt: string | null }
const KEY = 'frrata-partner-code'
const readSaved = (): Code | null => { try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Code | null; return v && v.code && new Date(v.expiresAt).getTime() > Date.now() ? v : null } catch { return null } } // clock-ok: after mount
const save = (c: Code | null) => { try { if (c) sessionStorage.setItem(KEY, JSON.stringify(c)); else sessionStorage.removeItem(KEY) } catch { /* private mode: the code shows until reload */ } }

/** "14 min left", from the clock read after mount (render never reads it: § Time in client components). */
function minutesLeft(until: string, now: number | null) {
  return now === null ? '' : `${Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000))} min left`
}

export function PartnerGate({ state, ownerName, phone, signOut }: GateProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<Code | null>(null)
  const [lost, setLost] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const [done, setDone] = useState<{ name: string } | null>(null)
  const [offerHere, setOfferHere] = useState(false)
  const asked = useRef(false)
  const owner = state?.role === 'owner'
  const request = state?.request ?? null
  const firstTime = (state?.passkeys ?? 0) === 0
  const waiting = !!request && !request.approved && !request.declined
  const wantsCode = !!state && !done && (firstTime || lost || waiting) && !request?.approved && !request?.declined

  const ask = useCallback(async () => {
    setBusy(true); toast.dismiss()
    const r = await call<Code>('request')
    setBusy(false)
    if (!r.ok || !r.value) { if (!r.ok) toast.error(r.error); return }
    setCode(r.value); save(r.value); router.refresh()
  }, [router, toast])

  // The code at once (mockup screen 7), once per page: a saved one for this request, else a new request.
  useEffect(() => {
    if (!wantsCode || asked.current) return
    asked.current = true
    const saved = readSaved()
    if (saved && waiting && saved.expiresAt === request?.expiresAt) setCode(saved)
    else if (!waiting) void ask()
  }, [wantsCode, waiting, request?.expiresAt, ask])
  // While a request waits, look again every 5 s (the approval lands on the server) and keep the minutes current.
  useEffect(() => {
    setNow(Date.now()) // clock-ok: after mount
    if (!waiting) return
    const t = setInterval(() => { router.refresh(); setNow(Date.now()) }, 5000) // clock-ok: a timer
    return () => clearInterval(t)
  }, [waiting, router])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setBusy(true); toast.dismiss()
    const r = await fn()
    setBusy(false)
    if (!r.ok) toast.error(r.error ?? 'Something went wrong. Try again.'); else after ? after() : router.refresh()
  }
  const create = () => run(async () => {
    const r = await addPasskey(deviceLabel(navigator.userAgent) ?? 'My passkey')
    if (r.ok) { save(null); setDone({ name: r.value?.name ?? '' }); setOfferHere(false) }
    return r
  }, () => {})
  const confirm = () => run(async () => {
    const r = await confirmPasskey()
    if (r.ok && r.value?.crossDevice && (state?.passkeys ?? 0) < 10) setOfferHere(true)
    else if (r.ok) router.refresh()
    return r
  }, () => {})

  let body: React.ReactNode
  if (!state) {
    body = <><h1 className="font-display text-[1.375rem] font-semibold leading-7">Sign in again</h1>
      <Link href="/partner/sign-in" className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-primary-foreground">Sign in</Link></>
  } else if (done) {
    // Screen 9.
    body = (
      <>
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-ok-text">
          <span aria-hidden="true" className="size-[18px] rounded-full bg-ok-mark" />{done.name ? `Passkey saved to ${done.name}` : 'Passkey saved'}
        </p>
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">You’re in</h1>
        <Button size="lg" onClick={() => router.refresh()}>Open your clients</Button>
        <Link href="/partner/passkeys" className="justify-self-start text-sm underline underline-offset-4">Add a passkey on another device</Link>
      </>
    )
  } else if (offerHere) {
    // Screen 14: confirmed with a phone's passkey; this device may keep its own.
    body = (
      <>
        <PasskeyTile />
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">Sign in faster on this device</h1>
        <p className="text-sm text-muted-foreground">Anyone who can unlock this device can sign in.</p>
        <Button size="lg" disabled={busy} onClick={create}>{busy ? 'Waiting for your device…' : 'Create a passkey'}</Button>
        <button type="button" className="justify-self-start text-sm underline underline-offset-4" onClick={() => router.refresh()}>Not now</button>
      </>
    )
  } else if (request?.approved) {
    // Screen 8.
    body = (
      <>
        {firstTime && !owner && <JoinSteps at={3} />}
        <PasskeyTile />
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">Sign in faster next time</h1>
        <p className="text-sm text-muted-foreground">Approved by {request.approvedBy === 'Frrata' ? 'Frrata' : ownerName}. Anyone who can unlock this device can sign in.</p>
        <Button size="lg" disabled={busy} onClick={create}>{busy ? 'Waiting for your device…' : 'Create a passkey'}</Button>
      </>
    )
  } else if (request?.declined) {
    body = (
      <>
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">{owner ? 'Frrata' : ownerName} declined the request</h1>
        <Button size="lg" disabled={busy} onClick={() => { asked.current = true; void ask() }}>Get a new code</Button>
      </>
    )
  } else if (wantsCode && owner) {
    // Screens 11 and 21: Frrata approves an owner; a recovery opens after 24 hours.
    const opens = code?.opensAt ?? request?.opensAt ?? null
    body = (
      <>
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">{opens ? 'Frrata approves it after 24 hours' : 'Frrata approves your first passkey'}</h1>
        {!opens && <p className="text-sm text-muted-foreground">We call you on {phone ?? 'the phone on file'}.<br />Read us this code.</p>}
        {code ? <ReadCode code={code.code} /> : waiting ? <Button variant="secondary" disabled={busy} onClick={() => void ask()}>Get a new code</Button> : null}
        {opens ? <p className="text-sm text-muted-foreground">Opens <span className="font-num">{dateTimeIN(new Date(opens))}</span></p>
          : request && <p className="text-sm text-muted-foreground">{minutesLeft(request.expiresAt, now)}</p>}
      </>
    )
  } else if (wantsCode) {
    // Screen 7.
    body = (
      <>
        {firstTime && <JoinSteps at={2} />}
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">Ask {ownerName} to call you</h1>
        <p className="text-sm text-muted-foreground">Read {ownerName} this code</p>
        {code ? <ReadCode code={code.code} /> : <p className="text-sm text-muted-foreground">{busy ? 'Getting a code…' : ''}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          {request && <span className="text-sm text-muted-foreground">Waiting for {ownerName} · {minutesLeft(request.expiresAt, now)}</span>}
          <span className="flex-1" />
          <button type="button" disabled={busy} className="text-sm underline underline-offset-4 disabled:opacity-60" onClick={() => void ask()}>Get a new code</button>
        </div>
      </>
    )
  } else {
    // Screen 5, and 19 behind "Can't use your passkey?".
    body = (
      <>
        <h1 className="font-display text-[1.375rem] font-semibold leading-7">Confirm it’s you</h1>
        <Button size="lg" disabled={busy} onClick={confirm}>{busy ? 'Waiting for your device…' : 'Use passkey'}</Button>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm underline underline-offset-4">Can’t use your passkey?</summary>
          <div className="mt-3 grid gap-3">
            <Button variant="secondary" size="lg" onClick={() => { setLost(true); asked.current = false }}>{owner ? 'Ask Frrata for a new passkey' : `Ask ${ownerName} for a new passkey`}</Button>
            <p className="text-sm text-muted-foreground">Then delete the lost passkey in Passkeys.</p>
          </div>
        </details>
      </>
    )
  }
  return <>{body}{signOut}</>
}
