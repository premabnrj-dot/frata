'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { dateTimeIN } from '@/lib/format-date'
import { deviceLabel } from '@/domains/partners/passkeys'
import { passkeyClient } from './passkey-client'
import { JoinSteps, PasskeyTile, ReadCode } from './partner-frame'
import { ConfirmSteps } from './confirm-steps'
import type { PartnerGate } from './types'

// =============================================================================
// FILE: src/components/passkeys/partner-gate.tsx — what a partner person sees instead of the workspace until this
// browser session passes a passkey check (T1b; partner sign-in mockup https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ,
// screens 5, 7, 8, 9, 11, 21). With a passkey: screens 1–3 of passkeys, simpler (ConfirmSteps, shared with Frrata
// Admin). Without one, or after "Ask for a new passkey": a code to read to the partner's owner (a Lead) or to Frrata (the owner), shown at once; once approved,
// "Create a passkey" on this device. A code lives only in this tab (the database keeps its hash), so a reload shows it
// again from sessionStorage, or asks for a new one. A failure is an error toast (§ Feedback 1).
// =============================================================================

export type GateProps = {
  state: PartnerGate | null
  /** Who approves a Lead: the partner's owner's first name ("Pia"). */
  ownerName: string
  /** The owner's phone on file, masked ("+91 98450 •••21"): Frrata calls it. */
  phone: string | null
  signOut: React.ReactNode
}

const { addPasskey, call } = passkeyClient('/partner/passkey')
type Code = { code: string; expiresAt: string; opensAt: string | null }
const KEY = 'frrata-partner-code'
const readSaved = (): Code | null => { try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Code | null; return v && v.code && new Date(v.expiresAt).getTime() > Date.now() ? v : null } catch { return null } } // clock-ok: after mount
const save = (c: Code | null) => { try { if (c) sessionStorage.setItem(KEY, JSON.stringify(c)); else sessionStorage.removeItem(KEY) } catch { /* private mode: the code shows until reload */ } }

/** "14 min left", from the clock read after mount (render never reads it: § Time in client components). */
function minutesLeft(until: string, now: number | null) {
  return now === null ? '' : `${Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000))} min left`
}

/** The screen's heading; focus moves here when the screen changes (it takes the ref; React 19 passes it as a prop). */
function Heading({ children, ref }: { children: React.ReactNode; ref: React.Ref<HTMLHeadingElement> }) {
  return <h1 ref={ref} tabIndex={-1} className="font-display text-title font-semibold outline-none">{children}</h1>
}

export function PartnerGate({ state, ownerName, phone, signOut }: GateProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<Code | null>(null)
  const [lost, setLost] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const [done, setDone] = useState<{ name: string } | null>(null)
  const [back, setBack] = useState(false)
  const asked = useRef(false)
  const owner = state?.role === 'owner'
  const request = state?.request ?? null
  const firstTime = (state?.passkeys ?? 0) === 0
  const waiting = !!request && !request.approved && !request.declined
  // "Use my passkey" from an ask screen: back to screens 1–3 while a request may still wait (P2 ends it on a check).
  const [mine, setMine] = useState(false)
  const wantsCode = !!state && !done && !mine && (firstTime || lost || waiting) && !request?.approved && !request?.declined

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
    // A Lead's code at once (screen 7); an owner presses "Request a call" (screen 11), which tells Frrata.
    else if (!waiting && !owner) void ask()
  }, [wantsCode, waiting, request?.expiresAt, ask, owner])
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
    if (!r.ok) toast.error(r.error ?? 'We couldn’t finish that. Nothing was changed. Try again.'); else after ? after() : router.refresh()
  }
  const create = () => run(async () => {
    const r = await addPasskey(deviceLabel(navigator.userAgent) ?? 'My passkey')
    if (r.ok) { save(null); setDone({ name: r.value?.name ?? '' }) }
    return r
  }, () => {})

  // Each state change replaces the focused control: focus moves to the new heading, which a screen reader reads.
  const phase = !state ? 'again' : done ? 'done' : request?.approved ? 'create' : request?.declined ? 'declined' : wantsCode ? 'code' : 'confirm'
  const head = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } head.current?.focus() }, [phase])

  let body: React.ReactNode
  if (!state) {
    body = <><Heading ref={head}>Sign in again</Heading>
      <Link href="/partner/sign-in" className={button({ size: 'lg' })}>Sign in</Link></>
  } else if (done) {
    // Screen 9.
    body = (
      <>
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-ok-text">
          <span aria-hidden="true" className="size-4.5 rounded-full bg-ok-mark" />{done.name ? `Passkey saved to ${done.name}` : 'Passkey saved'}
        </p>
        <Heading ref={head}>You’re in</Heading>
        <Button size="lg" onClick={() => router.refresh()}>Open your clients</Button>
        <Link href="/partner/passkeys" className={`${button({ variant: 'link' })} justify-self-start`}>Add a passkey on another device</Link>
      </>
    )
  } else if (request?.approved) {
    // Screen 8.
    body = (
      <>
        {firstTime && !owner && <JoinSteps at={3} />}
        <PasskeyTile />
        <Heading ref={head}>Sign in faster next time</Heading>
        <p className="text-sm text-muted-foreground">Approved by {request.approvedBy === 'Frrata' ? 'Frrata' : ownerName}. Anyone who can unlock this device can sign in.</p>
        <Button size="lg" busy={busy} onClick={create}>Create a passkey</Button>
      </>
    )
  } else if (request?.declined) {
    body = (
      <>
        <Heading ref={head}>{owner ? 'Frrata' : ownerName} declined the request</Heading>
        <Button size="lg" busy={busy} onClick={() => { asked.current = true; void ask() }}>Get a new code</Button>
      </>
    )
  } else if (wantsCode && owner) {
    // Screens 11 and 21: Frrata approves an owner; a recovery opens after 24 hours.
    const opens = code?.opensAt ?? request?.opensAt ?? null
    // An owner who has a passkey is recovering it (24 hours), even before the request exists (passkeys, simpler B6).
    const recovery = !!opens || !firstTime
    body = (
      <>
        <Heading ref={head}>{recovery ? 'Frrata approves it after 24 hours' : 'Frrata approves your first passkey'}</Heading>
        {!recovery && <p className="text-sm text-muted-foreground">We call you on {phone ?? 'the phone on file'}.<br />Read us this code.</p>}
        {code ? <ReadCode code={code.code} /> : waiting ? <Button variant="secondary" busy={busy} onClick={() => void ask()}>Get a new code</Button>
          : <Button size="lg" busy={busy} onClick={() => void ask()}>Request a call</Button>}
        {opens ? <p className="text-sm text-muted-foreground">Opens <span className="font-num">{dateTimeIN(new Date(opens))}</span></p>
          : request && <p className="text-sm text-muted-foreground">{minutesLeft(request.expiresAt, now)}</p>}
        {!firstTime && <Button variant="link" className="justify-self-start" onClick={() => { setMine(true); setLost(false); setBack(true) }}>Use my passkey</Button>}
      </>
    )
  } else if (wantsCode) {
    // Screen 7.
    body = (
      <>
        {firstTime && <JoinSteps at={2} />}
        <Heading ref={head}>Ask {ownerName} to call you</Heading>
        <p className="text-sm text-muted-foreground">Read {ownerName} this code</p>
        {code ? <ReadCode code={code.code} /> : <p role="status" className="text-sm text-muted-foreground">{busy ? 'Getting a code…' : ''}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          {request && <span className="text-sm text-muted-foreground">Waiting for {ownerName} · {minutesLeft(request.expiresAt, now)}</span>}
          <span className="flex-1" />
          <Button variant="link" busy={busy} onClick={() => void ask()}>Get a new code</Button>
        </div>
        {!firstTime && <Button variant="link" className="justify-self-start" onClick={() => { setMine(true); setLost(false); setBack(true) }}>Use my passkey</Button>}
      </>
    )
  } else {
    // Passkeys, simpler screens 1–3 (shared with Frrata Admin's gate).
    body = <ConfirmSteps endpoint="/partner/passkey" canSave={(state.passkeys ?? 0) < 10} headingClass="font-display text-title font-semibold"
      onDone={() => router.refresh()} focusOnMount={back}
      // "Ask for a new passkey": a Lead's code at once (screen 7); an owner presses "Request a call" first (screen 21).
      onAsk={() => { setLost(true); setMine(false); setBack(false); asked.current = owner }} />
  }
  return <>{body}{signOut}</>
}
