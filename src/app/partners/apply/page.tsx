import Link from 'next/link'
import { PictoTile } from '@/components/brand/illustrations'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { requireUser } from '@/lib/auth/require-user'
import { myPartner } from '@/lib/db/partners'
import { formatPhone } from '@/lib/format'
import { dateTimeIN } from '@/lib/format-date'
import { frataWhatsappLink } from '@/lib/site'
import { SignInFlow } from '../../login/sign-in-flow'
import { ApplyForm } from './apply-form'
import { Toaster } from '@/components/ui/toast'
import { Wordmark } from '@/components/brand/wordmark'

export const metadata = { title: 'Apply · Frrata Partners' }
export const dynamic = 'force-dynamic'

/** Apply (approved mockup screens 2 and 3): sign in → the form → in review. One page, every state. */
export default async function ApplyPage() {
  const auth = await requireUser()
  const partner = auth.ok ? await myPartner(auth.userId).catch(() => null) : null
  let body: React.ReactNode
  if (!auth.ok) {
    body = (<>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Apply to be a partner</h1>
      <p className="text-sm text-muted-foreground">Your email first. No password.</p>
      <SignInFlow intent="partner" />
    </>)
  } else if (!partner) {
    body = (<>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Apply to be a partner</h1>
      <p className="flex items-center text-sm text-muted-foreground">Signed in as <span className="ml-1 font-mono">{auth.email}</span>
        <InfoTip about="what we ask later">PAN, bank account and GSTIN (if you have one) are asked when your first share is due.</InfoTip></p>
      <Toaster><ApplyForm /></Toaster>
    </>)
  } else if (partner.approvedAt) {
    body = (<>
      <PictoTile name="clients" tone="haldi" />
      <h1 className="font-display text-2xl font-semibold tracking-tight">You’re a Frrata partner</h1>
      <Link href="/partner" className={button({ size: 'lg' })}>Open your workspace</Link>
    </>)
  } else if (partner.declinedAt) {
    body = (<>
      <Badge>Not approved</Badge>
      <h1 className="font-display text-2xl font-semibold tracking-tight">We can’t approve this one</h1>
      {partner.declineReason && <p className="text-sm">{partner.declineReason}</p>}
      <a href={frataWhatsappLink('Hi Frrata, about my partner application.')} target="_blank" rel="noopener" className="text-sm underline">Talk to us on WhatsApp</a>
    </>)
  } else {
    body = (<>
      <PictoTile name="apply" tone="haldi" />
      <div className="flex items-center gap-2"><Badge tone="warn">In review</Badge><span className="text-sm text-muted-foreground">Sent {dateTimeIN(partner.appliedAt)}</span></div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Got it, {partner.name.split(' ')[0]}</h1>
      <p className="text-sm">We reply on WhatsApp at <span className="font-mono">{formatPhone(partner.phone)}</span> within 2 working days.</p>
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Change my application</summary>
        <div className="pt-4">
          <Toaster><ApplyForm initial={{ name: partner.name, businessName: partner.businessName, phone: partner.phone.replace(/^91/, ''), city: partner.city, services: partner.services, workUrl: partner.workUrl, brandsNow: partner.brandsNow }} /></Toaster>
        </div>
      </details>
    </>)
  }
  return (
    <main data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-8">
        <Link href="/partners" aria-label="Frrata Partners" className="inline-flex min-h-6 items-center gap-2 text-base font-semibold"><Wordmark thread label={null} className="h-5" /> <span className="font-normal text-muted-foreground">Partners</span></Link>
      </header>
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">{body}</div>
    </main>
  )
}
