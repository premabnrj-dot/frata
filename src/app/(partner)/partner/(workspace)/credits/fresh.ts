'use client'

import { CONFIRM_AGAIN } from '@/domains/partners/passkeys'

// Credits and billing's writes that need a recent passkey check.
/** `freshly` (src/components/passkeys/fresh.ts) with the passkey code loaded only when the device must confirm: the
 *  page's first load stays under its 150 kB script budget (check:storefront-build). */
export async function freshly<R>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  const r = await fn()
  if ((r as { error?: unknown } | undefined)?.error !== CONFIRM_AGAIN) return r
  const { passkeyClient } = await import('@/components/passkeys/passkey-client')
  const c = await passkeyClient('/partner/passkey').confirmPasskey()
  return c.ok ? fn() : { ok: false, error: c.error }
}
