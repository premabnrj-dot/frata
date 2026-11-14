import { notFound } from 'next/navigation'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { E2E_FIXTURES } from '@/lib/env'
import { Gallery } from './gallery'

// TEST-ONLY: Neel's primitives, each in its states, on one page (Neel N0 step 7): the parity target for
// mockup-parity-reviewer against docs/mockups/2026-11-13-design-language-neel.html § Components, and the page
// e2e/flows/81-neel.mjs runs axe on. Answers only when the e2e stack sets E2E_FIXTURES=1; elsewhere a 404.
export const dynamic = 'force-dynamic'

export default async function NeelGallery() {
  if (!E2E_FIXTURES) notFound()
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) notFound()
  // Today in India time, for the date field (the server's clock: check:clock).
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
  return <Gallery today={today} />
}
