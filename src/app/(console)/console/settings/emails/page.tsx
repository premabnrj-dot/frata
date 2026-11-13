import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CAN_MANAGE, CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { shopEmailSettings } from '@/lib/queries/emails'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { EMAIL_NAMES } from '@/domains/email/words'
import { cleanEmail } from '@/domains/email/shape'
import { EMAIL_SHOP_DOMAIN } from '@/lib/env'
import { EmailSwitch } from './switches'

export const metadata = { title: 'Emails to shoppers' }

const WHEN: Record<string, string> = {
  confirmed: 'Right after the order. COD says what to pay.', finish_paying: 'An online order left unpaid, once.',
  shipped: 'Courier and tracking, 5 minutes after you mark it.', delivered: 'With the invoice on the order page.', cancelled: 'Why, and the refund when paid online.',
}

/** Settings › Emails to shoppers (mockup v2 screen 3): the sender, the last 7 days, each email with its switch. */
export default async function EmailsPage() {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const [data, shop] = await Promise.all([shopEmailSettings(tenantId).catch(() => null), shopSettingsFor(tenantId)])
  const back = { href: '/console/settings', label: 'Settings' }
  if (!data || !shop) return <><PageHeader title="Emails to shoppers" back={back} /><Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel></>
  const manage = (CAN_MANAGE as readonly string[]).includes(auth.membership.role) && !auth.membership.supportSessionId
  const reply = cleanEmail(shop.supportEmail)
  const from = EMAIL_SHOP_DOMAIN ? `${shop.slug}@${EMAIL_SHOP_DOMAIN}` : null
  const strip: [string, string][] = [['Sent', String(data.week.sent)], ['Delivered', data.week.sent ? `${Math.round((data.week.delivered / data.week.sent) * 1000) / 10}%` : '—'], ['Bounced', String(data.week.bounced)], ['Marked spam', String(data.week.complained)]]
  return (
    <>
      <PageHeader title="Emails to shoppers" back={back} />
      {!reply ? <Panel title="Add a support email first" action={<Link href="/console/settings/contact" className="text-sm underline underline-offset-4">Settings › Contact</Link>}>Order emails can’t start without a reply address.</Panel> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Sender">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">From</dt><dd><b className="font-medium">{shop.shopName}</b>{from ? <span className="ml-1 font-mono text-xs text-muted-foreground">{from}</span> : null}</dd>
            <dt className="text-muted-foreground">Replies go to</dt><dd className="font-num text-xs">{reply ?? '—'}</dd>
          </dl>
        </Section>
        <Section title="Last 7 days">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
            {strip.map(([k, v]) => <div key={k} className="bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-num text-lg font-semibold tabular-nums">{v}</dd></div>)}
          </dl>
        </Section>
      </div>
      <Section title="Emails about an order" flush>
        <ul className="divide-y divide-border">
          {data.list.map((e) => (
            <li key={e.kind} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0"><Link href={`/console/settings/emails/${e.kind}`} className="font-medium underline-offset-4 hover:underline">{EMAIL_NAMES[e.kind]}</Link>
                {e.edited ? <Badge tone="info" className="ml-2">Edited</Badge> : null}<br /><span className="text-xs text-muted-foreground">{WHEN[e.kind]}</span></span>
              <EmailSwitch kind={e.kind} name={EMAIL_NAMES[e.kind]} on={e.on} disabled={!manage || !reply} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
