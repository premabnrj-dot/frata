'use client'

import { useEffect, useState } from 'react'
import { resendWait } from '@/domains/access/email-code'
import { sendCode, verifyCode } from './actions'

/** Sending and checking the emailed code, and the "Send again in n s" count, for every page that signs in by code
 *  (/login, /start, the partner sign-in; O1·8b). The callers keep their own words and fields. */
export function useEmailCode() {
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(0) // read only once a code is sent, never while the page first renders
  useEffect(() => {
    if (!sentAt) return
    const t = setInterval(() => setNow(Date.now()), 1000) // clock-ok: a timer, after mount
    return () => clearInterval(t)
  }, [sentAt])
  async function send(email: string) {
    const r = await sendCode({ email })
    if (r.sent) { const t = Date.now(); setSentAt(t); setNow(t) } // clock-ok: in the send handler
    return r
  }
  return { sentAt, wait: resendWait(sentAt, now), send, verify: (email: string, code: string) => verifyCode({ email, code }) }
}
