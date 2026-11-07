'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EMAIL_SHAPE, emailTypo } from '@/domains/signup/slug'
import { sendCode, verifyCode } from './actions'
import { CodeInput } from './code-input'

const RESEND_SECONDS = 60 // Supabase refuses a second email to one address within a minute.

/**
 * Email → the 6-digit code from the same email. The link in that email works
 * too; the code is for a merchant who reads mail on another device. One flow
 * for signing in and signing up: an unknown email becomes a new account.
 */
export function SignInFlow({ intent, linkFailed }: { intent: 'signin' | 'start' | 'partner'; linkFailed?: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>(linkFailed ? 'code' : 'email')
  const [back, setBack] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!sentAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sentAt])
  const wait = sentAt ? Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000)) : 0

  function send(e?: React.FormEvent) {
    e?.preventDefault()
    const v = email.trim()
    if (!EMAIL_SHAPE.test(v)) return setError('That does not look like an email address.')
    const typo = emailTypo(v)
    if (typo) return setError(`Did you mean ${typo}?`)
    setError(null)
    start(async () => {
      const r = await sendCode({ email: v })
      if (!r.sent) return setError(r.error)
      setEmail(r.email); setCode(''); setSentAt(Date.now()); setNow(Date.now()); setBack(false); setStep('code')
    })
  }

  function check(c: string) {
    setCode(c)
    if (c.length !== 6 || !EMAIL_SHAPE.test(email.trim())) return
    setError(null)
    start(async () => {
      const r = await verifyCode({ email, code: c })
      if (!r.ok) { setError(r.error); setCode(''); return }
      // Applying as a partner: stay on the application unless a workspace or a waiting store comes first.
      if (intent === 'partner' && r.to !== '/partner' && r.to !== '/handover' && r.to !== '/admin' && r.to !== '/choose') { router.refresh(); return }
      router.replace(r.to)
      router.refresh()
    })
  }

  if (step === 'email') {
    const typo = emailTypo(email.trim())
    return (
      <form onSubmit={send} noValidate className={`space-y-4 ${back ? 'animate-step-back' : ''}`}>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="email">Your email</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus
            placeholder="you@yourbrand.in" value={email}
            aria-invalid={!!error || undefined} aria-describedby="email-msg"
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-base aria-invalid:border-danger-text" />
          <p id="email-msg" role="alert" className="min-h-5 text-sm text-danger-text">
            {error && typo && error.startsWith('Did you mean')
              ? <>Did you mean <button type="button" className="underline" onClick={() => { setEmail(typo); setError(null) }}>{typo}</button>?</>
              : error}
          </p>
        </div>
        <Button type="submit" disabled={pending} size="lg" className="w-full">
          {pending ? 'Sending…' : intent === 'signin' ? 'Email me a sign-in code' : 'Email me a code'}
        </Button>
        {intent === 'start' && <p className="text-xs text-muted-foreground">Free to build and preview. No card.</p>}
      </form>
    )
  }

  return (
    <div className="space-y-4 animate-step-forward">
      {linkFailed && !sentAt && (
        <p role="status" className="rounded-md border border-info-text/30 bg-info px-3 py-2 text-sm text-info-text">
          That link opened in a different browser or app. Type the 6-digit code from the same email here instead.
        </p>
      )}
      {sentAt ? (
        <p className="text-sm text-muted-foreground">
          We sent a link and a 6-digit code to <b className="text-foreground">{email}</b>.{' '}
          <button type="button" className="underline" onClick={() => { setBack(true); setStep('email'); setError(null) }}>Wrong email?</button>
        </p>
      ) : (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="email2">The email it was sent to</label>
          <input id="email2" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-base" />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="code">Code</label>
        <CodeInput value={code} onChange={check} disabled={pending} invalid={!!error} />
        <p role="alert" className="min-h-5 text-sm text-danger-text">{error}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {pending ? 'Checking…' : <>Nothing yet? Look in Promotions or Spam for &ldquo;Frata&rdquo;.{' '}
          {sentAt
            ? <button type="button" className="underline disabled:no-underline disabled:opacity-60" disabled={wait > 0} onClick={() => send()}>
                {wait > 0 ? `Send again in ${wait} s` : 'Send again'}
              </button>
            : <button type="button" className="underline" onClick={() => send()}>Send a new email</button>}</>}
      </p>
    </div>
  )
}
