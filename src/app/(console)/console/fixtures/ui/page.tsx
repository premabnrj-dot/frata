import { notFound } from 'next/navigation'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { E2E_FIXTURES } from '@/lib/env'
import { Primitives } from './primitives'
import { fixtureSave } from './actions'

// TEST-ONLY: the 1D·3 primitives on one page for e2e/flows/30-primitives.mjs. Answers only when the e2e stack
// sets E2E_FIXTURES=1 (e2e/stack.mjs); everywhere else, production included, it is a 404. Signed-in members only.
export const dynamic = 'force-dynamic'

export default async function UiFixtures() {
  if (!E2E_FIXTURES) notFound()
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) notFound()
  return <Primitives save={fixtureSave} />
}
