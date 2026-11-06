'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { sendMagicLink } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, { sent: false })
  if (state.sent) return <p className="text-sm">Check your email for a sign-in link.</p>
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" required autoComplete="email"
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
      {state.error && <p className="text-sm text-danger-text">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? 'Sending…' : 'Email me a sign-in link'}</Button>
    </form>
  )
}
