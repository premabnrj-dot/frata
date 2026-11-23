'use client'

import { useEffect, useRef, useState } from 'react'
import { FieldError, errorId } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { EMAIL_SHAPE, emailTypo } from '@/domains/signup/slug'
import { useEmailCode } from '@/app/login/use-email-code'
import { CodeInput } from '@/app/login/code-input'

/**
 * "Your email", then the code from it, on one screen (mockup § 1, step 2; O1·9). Send code → the code group appears
 * under the email; six digits check themselves; "Send again in n s" after a send. Editing the email asks to send again.
 * `onVerified` gets where verifyCode says the person goes (afterVerify decides what the page does).
 */
export function EmailStep({ onVerified }: { onVerified: (to: string) => void }) {
  const toast = useToast()
  const { sentAt, wait, send, verify } = useEmailCode()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ field: 'email' | 'su-code'; text: string; fix?: string } | null>(null)
  const [pending, setPending] = useState<'send' | 'check' | null>(null)
  const firstBox = useRef<HTMLInputElement>(null)
  const sent = !!sentTo && sentTo === email.trim().toLowerCase()
  const auto = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (auto.current) clearTimeout(auto.current) }, [])

  async function doSend() {
    const v = email.trim()
    if (!EMAIL_SHAPE.test(v)) return setError({ field: 'email', text: 'That does not look like an email address.' })
    const typo = emailTypo(v)
    if (typo) return setError({ field: 'email', text: `Did you mean ${typo}?`, fix: typo })
    setError(null); setPending('send')
    try {
      const r = await send(v)
      if (!r.sent) return r.field ? setError({ field: 'email', text: r.error }) : toast.error(r.error)
      setEmail(r.email); setSentTo(r.email); setCode('')
      requestAnimationFrame(() => firstBox.current?.focus())
    } catch { toast.error('No connection. Try again.') } finally { setPending(null) }
  }
  async function doCheck(c: string) {
    if (c.length !== 6) return setError({ field: 'su-code', text: 'Enter the 6 digits from your email.' })
    setError(null); setPending('check')
    try {
      const r = await verify(email.trim().toLowerCase(), c)
      if (!r.ok) {
        setCode(''); requestAnimationFrame(() => firstBox.current?.focus()) // after the boxes are enabled again
        return r.field ? setError({ field: 'su-code', text: r.error }) : toast.error(r.error)
      }
      onVerified(r.to)
    } catch { toast.error('No connection. Try again.') } finally { setPending(null) }
  }

  return (
    <form className="su-st" noValidate onSubmit={(e) => { e.preventDefault(); if (sent) void doCheck(code); else void doSend() }}>
      <h1 tabIndex={-1}>Your email</h1>
      <div className="su-f">
        <label htmlFor="su-email">Email</label>
        <input id="su-email" className="su-inp" type="email" inputMode="email" autoComplete="email" value={email}
          aria-invalid={error?.field === 'email' || undefined} aria-describedby={error?.field === 'email' ? errorId('email') : undefined}
          onChange={(e) => { setEmail(e.target.value); setError(null) }} />
        {error?.field === 'email' && error.fix
          // feedback-ok: § Feedback 3, a suggestion that carries its own fix (one tap) at the field, as /login's
          ? <span id={errorId('email')} className="flex min-h-5 animate-err-in items-center gap-1 text-sm text-danger-text">Did you mean <button type="button" className="underline" onClick={() => { setEmail(error.fix!); setError(null) }}>{error.fix}</button>?</span>
          : <FieldError name="email" message={error?.field === 'email' ? error.text : null} className="text-sm" />}
      </div>
      {sent && (
        <div className="su-f animate-step-forward">
          <span className="su-l" id="su-codelab">Code from your email</span>
          <div className="su-codebox"><CodeInput value={code} labelledBy="su-codelab" firstId="su-code" errorId={errorId('su-code')} boxRef={firstBox}
            invalid={error?.field === 'su-code'} disabled={pending === 'check'}
            onChange={(c) => {
              setCode(c); setError(null)
              if (auto.current) clearTimeout(auto.current)
              if (c.length === 6) auto.current = setTimeout(() => { void doCheck(c) }, 250) // as drawn: six digits check themselves
            }} /></div>
          <FieldError name="su-code" message={error?.field === 'su-code' ? error.text : null} className="text-sm" />
          {sentAt ? <button type="button" className="su-link justify-self-start" disabled={wait > 0 || !!pending} onClick={() => { void doSend() }}>
            {wait > 0 ? `Send again in ${wait} s` : 'Send again'}</button> : null}
        </div>
      )}
      <button type="submit" className="su-go" disabled={!!pending}>
        {pending === 'send' ? 'Sending…' : pending === 'check' ? 'Checking…' : sent ? 'Check code' : 'Send code'}
      </button>
    </form>
  )
}
