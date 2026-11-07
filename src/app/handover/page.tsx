import Link from 'next/link'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Panel } from '@/components/ui/panel'
import { PictoTile } from '@/components/brand/illustrations'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { requireUser } from '@/lib/auth/require-user'
import { myHandovers } from '@/lib/db/partners'
import { acceptHandoverAction } from './actions'

export const metadata = { title: 'Your store is ready' }
export const dynamic = 'force-dynamic'

/** The brand accepts the store its partner built (approved mockup screen 8). Nothing is claimed until Accept. */
export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const auth = await requireUser()
  const { error } = await searchParams
  const frame = (body: React.ReactNode) => <main data-shell className={`flex min-h-dvh items-start justify-center bg-background p-4 pt-16 ${SHELL_FONT_VARS}`}>{body}</main>
  if (!auth.ok) return frame(<Panel title="Sign in to see your store" action={<Link href="/login" className={button()}>Sign in</Link>} />)
  const handovers = await myHandovers(auth.userId).catch(() => null)
  if (!handovers) return frame(<Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>)
  if (!handovers.length) return frame(<Panel title="No store is waiting for you" action={<Link href="/console" className={button({ variant: 'secondary' })}>Go to your console</Link>}>{error}</Panel>)
  return frame(
    <div className="w-full max-w-lg space-y-4">
      {error && <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-text">{error}</p>}
      {handovers.map((h) => (
        <section key={h.inviteId} className="space-y-5 rounded-md border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <PictoTile name="handover" tone="haldi" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{h.tenantName} is ready</h1>
              <p className="text-sm text-muted-foreground">Built by {h.partnerName}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">You</dt><dd>Owner. The store and its data are yours.</dd>
            <dt className="text-muted-foreground">{h.partnerName}</dt>
            <dd>Partner: products, orders, settings, the look.<InfoTip about="what a partner can do">They can’t change billing, payment keys or people, or delete the store. Remove them any time in Settings › People.</InfoTip></dd>
            <dt className="text-muted-foreground">Your price</dt><dd>Same as any Frrata store.<InfoTip about="your price">Frrata pays the partner from its own fee. Nothing is added to yours.</InfoTip></dd>
          </dl>
          <form action={acceptHandoverAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="inviteId" value={h.inviteId} />
            <button type="submit" className={button({ size: 'lg' })}>Accept {h.tenantName}</button>
            <Link href="/console" className="text-sm underline">Not now</Link>
          </form>
        </section>
      ))}
    </div>,
  )
}
