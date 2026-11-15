'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FIELD } from '@/components/ui/field'
import { FieldError } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { EMAIL_SHAPE } from '@/domains/signup/slug'
import { maskEmail } from '@/domains/partners/passkeys'
import { sendCode, verifyCode } from '@/app/login/actions'

const RESEND_SECONDS = 60 // Supabase refuses a second email to one address within a minute.

/**
 * Screens 1–2: "Work email" → "Continue with email" → "Check your email", one code box that takes a paste and the
 * phone's one-time-code autofill (WCAG 2.2 SC 3.3.8). A workspace destination goes to `next`; anything else (an invite,
 * a handover, Admin) goes where sign-in would send it anyway.
 */
export function PartnerSignIn({ next, signedOut = false, backLabel = null }: { next: string; signedOut?: boolean; backLabel?: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState<'out' | 'email' | 'code'>(signedOut ? 'out' : 'email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [pending, start] = useTransition()
  const codeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!sentAt) return
    const t = setInterval(() => setNow(Date.now()), 1000) // clock-ok: a timer, after mount
    return () => clearInterval(t)
  }, [sentAt])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])
  const wait = sentAt ? Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000)) : 0

  function send(e?: React.FormEvent) {
    e?.preventDefault()
    const v = email.trim()
    if (!EMAIL_SHAPE.test(v)) return setError('Enter your work email.')
    setError(null)
    start(async () => {
      const r = await sendCode({ email: v })
      if (!r.sent) return r.field ? setError(r.error) : toast.error(r.error)
      setEmail(r.email); setCode(''); setSentAt(Date.now()); setNow(Date.now()); setStep('code') // clock-ok: in the send handler
    })
  }
  function check(e?: React.FormEvent) {
    e?.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.')
    setError(null)
    start(async () => {
      const r = await verifyCode({ email, code })
      // A wrong code stays in the box to be corrected; focus goes back to it.
      if (!r.ok) { codeRef.current?.focus(); return r.field ? setError(r.error) : toast.error(r.error) }
      router.replace(r.to === '/partner' ? next : r.to)
      router.refresh()
    })
  }

  if (step === 'out') {
    return (
      <div className="grid gap-4">
        <h1 className="font-display text-title font-semibold">You’ve been signed out</h1>
        {backLabel && <p className="text-sm text-muted-foreground">Back to {backLabel}</p>}
        <Button size="lg" onClick={() => setStep('email')}>Sign in again</Button>
      </div>
    )
  }
  if (step === 'email') {
    return (
      <form onSubmit={send} noValidate className="grid gap-4">
        <h1 className="font-display text-title font-semibold">Sign in</h1>
        <div className="grid gap-1.5">
          <label htmlFor="partner-email" className="text-sm font-medium">Work email</label>
          <input id="partner-email" type="email" inputMode="email" autoComplete="username" autoFocus value={email}
            aria-invalid={!!error || undefined} aria-describedby={error ? 'email-error' : undefined}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            className={`${FIELD} w-full aria-invalid:border-danger-text`} />
          <FieldError name="email" message={error} reserve className="text-sm" />
        </div>
        <Button type="submit" size="lg" busy={pending}>Continue with email</Button>
      </form>
    )
  }
  return (
    <form onSubmit={check} noValidate className="grid gap-4">
      <h1 className="font-display text-title font-semibold">Check your email</h1>
      <p className="text-sm text-muted-foreground">Code sent to {maskEmail(email)}</p>
      <div className="grid gap-1.5">
        <label htmlFor="partner-code" className="text-sm font-medium">6-digit code</label>
        <input id="partner-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" value={code}
          aria-invalid={!!error || undefined} aria-describedby={error ? 'code-error' : undefined}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); setError(null) }}
          className={`${FIELD} w-full text-center font-mono text-title tracking-widest aria-invalid:border-danger-text`} />
        <FieldError name="code" message={error} reserve className="text-sm" />
      </div>
      <Button type="submit" size="lg" busy={pending}>Sign in</Button>
      <div className="flex flex-wrap items-center gap-2.5">
        {wait > 0 ? <span className="text-sm text-muted-foreground">Resend in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, '0')}</span>
          : <Button variant="link" onClick={() => send()}>Resend code</Button>}
        <span className="flex-1" />
        <Button variant="link" onClick={() => { setStep('email'); setError(null) }}>Use a different email</Button>
      </div>
    </form>
  )
}
