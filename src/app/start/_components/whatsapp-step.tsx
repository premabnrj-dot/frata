'use client'

import { useState } from 'react'
import { Spinner } from '@/components/ui/button'
import { FieldError, errorId } from '@/components/ui/field-error'
import { sendSignupCode, verifySignupCode } from '../actions'

/** The WhatsApp code (trials TR1; only while `signupCodeOn()`): today's step in the sign-up's column. The code's id and
 *  whether it was verified live in the flow, so Back and forth keep them. */
export function WhatsappStep({ codeId, verified, onCode, onVerified, onNext }: {
  codeId: string | null; verified: boolean
  onCode: (id: string) => void; onVerified: () => void; onNext: () => void
}) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ field: 'phone' | 'code'; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (verified) return onNext()
    setPending(true)
    try {
      if (!codeId) {
        const r = await sendSignupCode(phone)
        if (!r.ok) return setError({ field: 'phone', text: r.error })
        onCode(r.codeId)
      } else {
        const r = await verifySignupCode(codeId, code)
        if (!r.ok) return setError({ field: 'code', text: r.error ?? 'Try again.' })
        onVerified(); onNext()
      }
    } catch { setError({ field: codeId ? 'code' : 'phone', text: 'No connection. Try again.' }) } finally { setPending(false) }
  }
  return (
    <form className="su-st" noValidate onSubmit={submit}>
      <h1 tabIndex={-1}>Your WhatsApp number</h1>
      <div className="su-f">
        <label htmlFor="phone">Mobile number</label>
        <div className="flex gap-2">
          <span className="su-inp flex w-auto items-center bg-muted font-mono text-sm">+91</span>
          <input id="phone" className="su-inp font-mono" inputMode="tel" autoComplete="tel-national" maxLength={10} value={phone} disabled={!!codeId}
            aria-invalid={error?.field === 'phone' || undefined} aria-describedby={error?.field === 'phone' ? errorId('phone') : undefined}
            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null) }} />
        </div>
        <FieldError name="phone" message={error?.field === 'phone' ? error.text : null} className="text-sm" />
      </div>
      {codeId && !verified && (
        <div className="su-f animate-step-forward">
          <label htmlFor="wa-code">Code from WhatsApp</label>
          <input id="wa-code" className="su-inp w-40 font-mono tracking-widest" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            aria-invalid={error?.field === 'code' || undefined} aria-describedby={error?.field === 'code' ? errorId('wa-code') : undefined}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} />
          <FieldError name="wa-code" message={error?.field === 'code' ? error.text : null} className="text-sm" />
        </div>
      )}
      {/* Busy, as Button's busy: the label stays, a spinner joins it, aria-disabled keeps focus; submit ignores a press. */}
      <button type="submit" className="su-go" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
        {pending ? <Spinner /> : null}{!codeId ? 'Send code' : verified ? 'Continue' : 'Verify'}</button>
    </form>
  )
}
