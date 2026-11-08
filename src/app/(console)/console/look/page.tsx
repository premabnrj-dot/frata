import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { cmpSemver, CATALOGUE, manifestOf, THEME_ORDER } from '@/domains/themes/catalogue'
import { latestAvailable } from '@/domains/themes/release'
import { resolveStored, resolveTheme } from '@/domains/themes/resolve'
import { ANY_MEMBER, CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN, dayIN } from '@/lib/format-date'
import { lookPage } from '@/lib/queries/look'
import { previewShop } from '@/lib/queries/storefront'
import { Gallery, type GalleryTheme } from './_components/gallery'
import { LookActions } from './_components/look-actions'
import { ThemeThumb } from './_components/thumb'

export const metadata = { title: 'Look' }

/** Console › Look (approved mockup 2026-11-08): the published look, the draft, and the five themes. */
export default async function LookPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const t = auth.membership.tenantId
  const [l, shop] = await Promise.all([lookPage(t), previewShop(t)])
  if (!shop) return <Panel title="We could not load your shop." />
  const role = auth.membership.role
  const support = !!auth.membership.supportSessionId
  const canEdit = (CAN_BUILD as readonly string[]).includes(role) && !support
  const canPublish = (CAN_MANAGE as readonly string[]).includes(role) && !support
  const liveRev = l.live?.revision ?? null
  const liveTheme = resolveStored(liveRev, shop)
  const liveM = manifestOf(liveTheme.key, liveTheme.version)!
  const styleName = liveM.styles.find((s) => s.key === liveTheme.style)?.name ?? liveTheme.style
  const sells = new Set(l.facts.sells)
  // Only versions this shop may use (released, or staged to it; never recalled or withdrawn: themes T3).
  const offered = THEME_ORDER.flatMap((k) => { const m = latestAvailable(k, Object.values(CATALOGUE[k] ?? {}), l.access.rows, l.access.staged); return m ? [m] : [] })
  const liveOk = !l.live || l.may(l.live.revision.themeKey, l.live.revision.themeVersion)
  const newest = offered.find((m) => m.key === liveTheme.key && cmpSemver(m.version, liveTheme.version) > 0) ?? null
  const withdrawn = l.history[0] && l.live && l.history[0].revision.id !== l.live.revision.id ? CATALOGUE[l.history[0].revision.themeKey]?.[l.history[0].revision.themeVersion] ?? null : null
  const draftOk = !l.draft || l.may(l.draft.themeKey, l.draft.themeVersion)
  const themes: GalleryTheme[] = offered.map((m) => ({
    key: m.key, name: m.name, job: m.job, version: m.version, features: m.features, inUse: m.key === liveTheme.key, newer: m.key === liveTheme.key && cmpSemver(m.version, liveTheme.version) > 0,
    styles: m.styles.map((s) => ({ key: s.key, name: s.name, colour: s.schemes.paper.accent })),
    thumb: <ThemeThumb t={resolveTheme(m, { style: m.styles[0]!.key })} name={shop.shopName} size="sm" />,
    fits: m.goodFor.filter((g) => sells.has(g)).length,
  })).sort((a, b) => b.fits - a.fits)
  const draftName = l.draft ? `${CATALOGUE[l.draft.themeKey]?.[l.draft.themeVersion]?.name ?? l.draft.themeKey}` : null
  return (
    <>
      <PageHeader title="Look" meta="How your shop looks. Shoppers see the published theme." />
      {withdrawn && <p role="status" className="mb-3 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">Frrata withdrew {withdrawn.name} {withdrawn.version} for a problem. Your previous look is live; nothing is lost.</p>}
      {!liveOk && <p role="status" className="mb-3 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">Frrata recalled {liveM.name} {liveM.version}. Your shop still shows it, but it gets no fixes.{l.previous && canPublish ? ' Restore your previous look below, or try the theme again for its current version.' : ' Ask the owner to restore the previous look.'}</p>}
      {!draftOk && l.draft && <p role="status" className="mb-3 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">Your draft is on a recalled version of {draftName}, so it can’t be published. Try the theme again: your changes come across.</p>}
      {newest && liveOk && <p role="status" className="mb-3 rounded-md bg-info px-3 py-2 text-sm text-info-text">{newest.name} {newest.version} is ready: {newest.features.at(-1)}. Try it from the gallery below; your look comes across in a draft, and nothing changes until you publish.</p>}
      <Section ariaLabel="Your theme">
        <div className="flex flex-wrap items-center gap-6">
          <ThemeThumb t={liveTheme} name={shop.shopName} />
          <div className="min-w-[14rem] flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{liveM.name} · {styleName}</h2><Badge tone="ok">Published</Badge></div>
            <p className="text-sm text-muted-foreground">
              {l.live ? <>Version {liveM.version} · published {dayIN(l.live.publishedAt)}{l.live.publishedByEmail ? ` by ${l.live.publishedByEmail}` : ''}</> : <>Your shop as it is today</>}
              {' · '}<Link href="/console/look/history" className="underline underline-offset-4">History</Link>
            </p>
            {l.draft && <p className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="warn">Draft</Badge>{draftName !== liveM.name ? `${draftName}: ` : ''}You have unpublished changes · saved {dateTimeIN(l.draft.updatedAt)}</p>}
            <LookActions canEdit={canEdit} canPublish={canPublish} hasDraft={!!l.draft} undoFrom={l.previous && canPublish ? l.live!.revision.id : null} restore={!liveOk && !!l.previous && canPublish} support={support} />
          </div>
        </div>
      </Section>
      <Gallery themes={themes} canEdit={canEdit} sorted={sells.size > 0} />
    </>
  )
}
