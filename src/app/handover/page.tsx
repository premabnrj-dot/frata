import Link from 'next/link'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Panel } from '@/components/ui/panel'
import { PictoTile } from '@/components/brand/illustrations'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { requireUser } from '@/lib/auth/require-user'
import { myHandoverKeys, myHandovers, type HandoverSite } from '@/lib/db/partners'
import { Badge } from '@/components/ui/badge'
import { ActionForm } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { acceptHandoverAction } from './actions'

export const metadata = { title: 'Your store is ready' }
export const dynamic = 'force-dynamic'

/** The brand accepts the store its partner built (approved mockup screen 8). Nothing is claimed until Accept. */
export default async function HandoverPage() {
  const auth = await requireUser()
  const frame = (body: React.ReactNode) => <main data-shell className={`flex min-h-dvh items-start justify-center bg-background p-4 pt-16 ${SHELL_FONT_VARS}`}>{body}</main>
  if (!auth.ok) return frame(<Panel title="Sign in to see your store" action={<Link href="/login" className={button()}>Sign in</Link>} />)
  const [handovers, sites] = await Promise.all([myHandovers(auth.userId).catch(() => null), myHandoverKeys(auth.userId).catch(() => new Map<string, HandoverSite>())])
  if (!handovers) return frame(<Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>)
  if (!handovers.length) return frame(<Panel title="No store is waiting for you" action={<Link href="/console" className={button({ variant: 'secondary' })}>Go to your console</Link>} />)
  return frame(
    <div className="w-full max-w-lg space-y-4">
      {handovers.map((h) => (
        <section key={h.inviteId} className="space-y-5 rounded-md border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <PictoTile name="handover" tone="haldi" />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">{h.tenantName} is ready</h1>
              <p className="text-sm text-muted-foreground">Built by {h.partnerName}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">You</dt><dd>Owner. The store and its data are yours.</dd>
            <dt className="text-muted-foreground">{h.partnerName}</dt>
            <dd>Partner: products, orders, settings, the look.<InfoTip about="what a partner can do">They can’t change billing, payment keys or people, or delete the store. Remove them any time in Settings › People.</InfoTip></dd>
            <dt className="text-muted-foreground">Your price</dt><dd>Same as any Frrata store.<InfoTip about="your price">Frrata pays the partner from its own fee. Nothing is added to yours.</InfoTip></dd>
            {/* P2 Clients, owner 2026-11-15 (Q1): the partner owner sees Frrata's share in rupees, so the brand is told here. */}
            <dt className="text-muted-foreground">Their share</dt><dd>Your partner sees what Frrata earns from your store.</dd>
            {/* The store's own website and the keys it reads with (SA1b mockup § Accept; managed in Settings › Website after Accept). */}
            {sites.get(h.inviteId) ? <><dt className="text-muted-foreground">Website</dt><dd className="min-w-0">{sites.get(h.inviteId)!.host ? <span className="font-mono text-small [overflow-wrap:anywhere]">{sites.get(h.inviteId)!.host}</span> : null}
              <ul className={sites.get(h.inviteId)!.host ? 'mt-2' : undefined} aria-label="Website keys">
                {sites.get(h.inviteId)!.keys.map((k, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-t border-line-soft py-2 first:border-t-0 first:pt-0">
                    <span className="min-w-0 truncate">{k.name}</span>
                    <Badge tone={k.kind === 'public' ? 'info' : 'neutral'}>{k.kind === 'public' ? 'Live' : k.kind === 'build' ? 'Build' : 'Test'}</Badge>
                    {k.kind === 'test' ? <span className="col-span-2 text-small text-muted-foreground">Ends when the store opens</span> : null}
                  </li>
                ))}
              </ul></dd></> : null}
          </dl>
          <ActionForm action={acceptHandoverAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="inviteId" value={h.inviteId} />
            <Submit size="wrap">Accept {h.tenantName}</Submit>
            <Link href="/console" className="text-sm underline">Not now</Link>
          </ActionForm>
        </section>
      ))}
    </div>,
  )
}
