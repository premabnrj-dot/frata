'use server'

import { ANY_MEMBER } from '@/lib/auth/require-member'
import { asMember } from '@/lib/auth/as-member'
import { E2E_FIXTURES } from '@/lib/env'
import type { ActionResult } from '@/components/ui/action-form'

// TEST-ONLY (see page.tsx): the ActionForm's three answers for e2e/flows/30-primitives.mjs. Refuses outside the e2e
// stack, and anyone not signed in, like the page. Writes nothing.
export async function fixtureSave(form: FormData): Promise<ActionResult> {
  if (!E2E_FIXTURES) return { error: 'Not here.' }
  const name = String(form.get('shop') ?? '').trim()
  const r = await asMember(ANY_MEMBER, { action: 'fixture.rename' }, async () => name)
  if (!r.ok) return { error: r.error }
  if (name === 'taken') return { fields: { shop: 'That name is taken.' } }
  if (name === 'refuse') return { error: 'Only an admin can rename a shop.' }
  return { ok: `Renamed to ${name}.` }
}
