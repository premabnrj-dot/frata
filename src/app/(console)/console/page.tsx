import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { readyToOpen, setupSteps } from '@/domains/setup/checklist'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { formatInr } from '@/lib/format'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { shopWithSettings } from '@/lib/queries/settings'
import { activeProductCount, paymentStatusFor } from '@/lib/queries/payments'
import { OpenShop } from './_components/open-shop'

/** Pages the checklist may link to. Each flips to true when its sub-phase ships (docs/plans/2026-11-06-phase-1-first-sale.md). */
const BUILT = { products: true, settings: true, publish: true }

export default async function ConsoleHome() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const [shop, products, pay] = await Promise.all([shopWithSettings(auth.membership.tenantId), activeProductCount(auth.membership.tenantId), paymentStatusFor(auth.membership.tenantId)])
    .catch((err) => { console.error('[console home]', err instanceof Error ? err.name : err); return [null, 0, null] as const })
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>

  const address = `${shop.slug}.${SHOP_DOMAIN}`
  const steps = setupSteps({
    shopName: shop.name, address, productCount: products,
    legalName: shop.settings.legalName, grievanceName: shop.settings.grievanceName,
    codOn: shop.settings.codOn, codMaxPaise: shop.settings.codMax, paymentsConnected: !!pay?.connected && pay.mode === 'live' && !!pay.webhookSeenAt, publishedAt: shop.settings.publishedAt,
  }, BUILT, (p) => formatInr(paise(p)))
  const done = steps.filter((s) => s.done).length

  return (
    <>
      <PageHeader title="Home" />
      <p className="-mt-2 text-sm text-muted-foreground">{shop.name} · <span className="font-mono">{address}</span></p>
      <section aria-labelledby="setup-h" className="max-w-3xl rounded-md border border-border bg-card">
        <div className="space-y-2.5 p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="setup-h" className="text-lg font-semibold">Get your shop ready to sell</h2>
            <span className="text-sm text-muted-foreground"><span className="font-mono">{done} of {steps.length}</span> done</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${done} of ${steps.length} steps done`}>
            <div className="h-full bg-ok-text transition-[width] duration-slow ease-standard" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
        <ol>
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 border-t border-border px-4 py-3">
              <Badge tone={s.done ? 'ok' : 'neutral'} className="mt-0.5 w-14 justify-center">{s.done ? 'Done' : 'To do'}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.href && !s.done ? <Link href={s.href} className="underline-offset-2 hover:underline">{s.title}</Link> : s.title}</p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
                {s.key === 'publish' && <div className="mt-2"><OpenShop address={address} open={s.done} ready={readyToOpen(steps)} canManage={auth.membership.role !== 'staff'} /></div>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
