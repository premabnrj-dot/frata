import { PageHeader } from '@/components/layout/page-header'
import type { Offer } from '@/domains/modules/offer'
import { GROUPS, MODULES, type ModuleKey } from '@/domains/modules/registry'
import { SHOWCASE } from '@/domains/modules/showcase'
import { AppAction } from './app-action'
import { AppFacts } from './app-facts'
import { ShowcaseShot } from '@/components/modules/showcase-shot'
import { AppTile } from './tile'

export type AboutProps = {
  k: ModuleKey
  offer: Offer
  worksWith: { key: ModuleKey; name: string; on: boolean }[]
  canManage: boolean
  askHref: string
  /** Shown above the page (a paused app, a number still connected). */
  notice?: React.ReactNode
  /** Under the price box (Messages' Disconnect while off). */
  after?: React.ReactNode
}

/**
 * An app's page while it isn't in use (Apps gallery, approved mockup 2026-11-11): what it does, with drawn pictures;
 * questions; and the price box with the ONE action. Read by /console/apps/[app] and by the pages of apps that have
 * their own home (Messages, EkCode, GST) until they are on — so every app is described in one place.
 */
export function AppAbout({ k, offer, worksWith, canManage, askHref, notice, after }: AboutProps) {
  const def = MODULES[k], show = SHOWCASE[k]
  const group = GROUPS.find(([g]) => g === def.group)?.[1]
  return (
    <>
      <PageHeader title={def.name} back={{ href: '/console/apps', label: 'Apps' }} />
      {notice}
      <div className="grid gap-6 pb-24 md:pb-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-wrap items-start gap-4">
            <AppTile k={k} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">By Frrata{group ? ` · ${group}` : ''}{worksWith.length ? ` · Works with ${worksWith.map((w) => w.name).join(', ')}` : ''}</p>
              <p className="mt-1 max-w-prose text-base">{show.headline}</p>
            </div>
          </div>
          <ol className="space-y-6">
            {show.features.map((f, i) => (
              <li key={f.title} className="grid items-center gap-4 md:grid-cols-2">
                <div className={i % 2 ? 'md:order-2' : ''}><ShowcaseShot shot={f.shot} /></div>
                <div><h2 className="text-section font-semibold">{f.title}</h2><p className="text-sm text-muted-foreground">{f.line}</p></div>
              </li>
            ))}
          </ol>
          {show.questions.length ? (
            <section aria-labelledby="faq" className="space-y-1">
              <h2 id="faq" className="text-section font-semibold">Questions</h2>
              {show.questions.map((x) => (
                <details key={x.q} className="border-t border-border py-2.5 last:border-b">
                  <summary className="flex min-h-6 cursor-pointer items-center justify-between font-medium">{x.q}</summary>
                  <p className="mt-1 text-sm text-muted-foreground">{x.a}</p>
                </details>
              ))}
            </section>
          ) : null}
        </div>
        <aside className="space-y-3">
          <AppFacts k={k} offer={offer} worksWith={worksWith} priceClass="max-md:hidden"
            action={<AppAction k={k} name={def.name} action={offer.action} canManage={canManage} askHref={askHref} block />} />
          {after}
        </aside>
      </div>
      {/* Phone: the price and the button in a bar above the bottom nav (architecture review A9). */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-20 border-t border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 font-mono text-sm font-semibold">{offer.price}</p>
          <div className="shrink-0"><AppAction k={k} name={def.name} action={offer.action} canManage={canManage} askHref={askHref} /></div>
        </div>
      </div>
    </>
  )
}
