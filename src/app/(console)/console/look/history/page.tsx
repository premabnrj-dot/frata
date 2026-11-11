import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { manifestOf, type ManifestSource } from '@/domains/themes/source'
import { manifestsFor } from '@/lib/themes/manifests'
import { ANY_MEMBER, CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { lookPage } from '@/lib/queries/look'
import { RestoreButton } from '../_components/restore'

export const metadata = { title: 'History · Look' }

const nameOf = (src: ManifestSource, r: { themeKey: string; themeVersion: string; styleKey: string }) => {
  const m = manifestOf(src, r.themeKey, r.themeVersion)
  return `${m?.name ?? r.themeKey} · ${m?.styles.find((s) => s.key === r.styleKey)?.name ?? r.styleKey}`
}

/** Every look the shop published (and the open draft). Restore makes one the draft again (mockup "Publish"). */
export default async function LookHistory() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const [l, src] = await Promise.all([lookPage(auth.membership.tenantId), manifestsFor(auth.membership.tenantId)])
  const canEdit = (CAN_BUILD as readonly string[]).includes(auth.membership.role) && !auth.membership.supportSessionId
  const by = (e: string | null) => e ?? 'Frrata (your look before themes)'
  return (
    <>
      <PageHeader title="History" back={{ href: '/console/look', label: 'Look' }} meta="Every look you published. Restore one to make it your draft again." />
      <Section flush ariaLabel="Looks">
        <ul className="divide-y divide-border text-sm">
          {l.draft && (
            <li className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-[10rem] flex-1 font-semibold">{nameOf(src, l.draft)}</span>
              <span className="text-muted-foreground">Saved {dateTimeIN(l.draft.updatedAt)} · {l.draft.updatedByEmail ?? '—'}</span>
              <Badge tone="warn">Draft</Badge>
              <a href="/console/look/customize" className="underline underline-offset-4">Open</a>
            </li>
          )}
          {l.history.map((h, i) => (
            <li key={`${h.revision.id}-${h.publishedAt.toISOString()}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`min-w-[10rem] flex-1 ${i === 0 ? 'font-semibold' : ''}`}>{nameOf(src, h.revision)}</span>
              <span className="text-muted-foreground">{dateTimeIN(h.publishedAt)} · {by(h.publishedByEmail)}</span>
              {h.publishId === l.live?.publishId ? <Badge tone="ok">Live</Badge> : !l.may(h.revision.themeKey, h.revision.themeVersion) ? <span className="text-xs text-muted-foreground">Not offered by Frrata any more: can’t be restored</span> : canEdit ? <RestoreButton revisionId={h.revision.id} when={dateTimeIN(h.publishedAt)} replacesDraft={!!l.draft} /> : null}
            </li>
          ))}
        </ul>
      </Section>
      <p className="text-sm text-muted-foreground">Only the owner or an admin can publish. Partners can edit the draft.</p>
    </>
  )
}
