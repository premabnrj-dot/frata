import { PartnerFrame } from '@/components/passkeys/partner-frame'
import { Toaster } from '@/components/ui/toast'
import { partnerReturnPath } from '@/domains/partners/passkeys'
import { PartnerSignIn } from './partner-sign-in'

export const metadata = { title: 'Sign in · Frrata Partners' }
export const dynamic = 'force-dynamic'

/**
 * Partner sign-in (T1b; partner sign-in mockup screens 1–2): work email, then the 6-digit code from the email in one
 * box. The passkey comes after, in the workspace (a passkey cannot start a session here: there is no service key,
 * CLAUDE.md). `next` is only a workspace path (partnerReturnPath), never a URL.
 */
export default async function PartnerSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <Toaster><PartnerFrame><PartnerSignIn next={partnerReturnPath(next)} /></PartnerFrame></Toaster>
}
