import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CAN_MANAGE, CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { ORDER_MESSAGES, type OrderMessage } from '@/domains/messaging/events'
import { DEFAULT_WORDS, EMAIL_NAMES } from '@/domains/email/words'
import { shopEmailSettings } from '@/lib/queries/emails'
import { previewOrderEmail } from '@/lib/email/preview'
import { Editor } from './editor'

export const metadata = { title: 'Edit an email' }

/** One email (mockup v2 screen 4): words in fields; the preview is what a shopper gets, on a sample order. */
export default async function EmailPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (!(ORDER_MESSAGES as readonly string[]).includes(kind)) notFound()
  const k = kind as OrderMessage
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const data = await shopEmailSettings(tenantId).catch(() => null)
  const row = data?.list.find((e) => e.kind === k)
  const back = { href: '/console/settings/emails', label: 'Emails to shoppers' }
  if (!row) return <><PageHeader title={EMAIL_NAMES[k]} back={back} /><Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel></>
  const preview = await previewOrderEmail(tenantId, k, row.words)
  const readOnly = !(CAN_MANAGE as readonly string[]).includes(auth.membership.role) || !!auth.membership.supportSessionId
  return (
    <>
      <PageHeader title={EMAIL_NAMES[k]} back={back} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section><Editor kind={k} words={row.words} defaults={DEFAULT_WORDS[k]} on={row.on} readOnly={readOnly} /></Section>
        <Section title="Preview" flush>
          {/* sandbox="": no scripts, not this origin (security review M1). Saved words; Save shows a change here. */}
          {preview ? <iframe title={`Preview: ${EMAIL_NAMES[k]}`} sandbox="" srcDoc={preview.mail.html} className="h-[640px] w-full rounded-b-md bg-card" /> : null}
        </Section>
      </div>
    </>
  )
}
