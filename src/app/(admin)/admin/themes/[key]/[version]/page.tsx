import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { CATALOGUE } from '@/domains/themes/catalogue'
import { cmpSemver } from '@/domains/themes/semver'
import { isBaseline } from '@/domains/themes/release'
import { SECTION_NAMES } from '@/domains/themes/sections'
import { shopsNamed, themeVersionsForAdmin } from '@/lib/admin/themes'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { pullAction, releaseAction, stageAction, unstageAction } from '../../actions'
import { StateBadge } from '../../state-badge'
import { Submit } from '@/components/ui/submit'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Theme version' }

const input = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

/** One version (mockup "Admin › Themes"): what changed, who it's offered to, and the decisions (each final). */
export default async function ThemeVersionPage({ params, searchParams }: { params: Promise<{ key: string; version: string }>; searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ key, version }, sp, adminRole] = await Promise.all([params, searchParams, requireStaff(ADMIN_ONLY)])
  const all = await themeVersionsForAdmin(staff)
  const v = all.find((x) => x.key === key && x.version === version)
  if (!v) notFound()
  const admin = adminRole.ok
  const prev = Object.values(CATALOGUE[key] ?? {}).filter((m) => cmpSemver(m.version, version) < 0).sort((a, b) => cmpSemver(b.version, a.version))[0] ?? null
  const now = CATALOGUE[key]?.[version] ?? null
  // TS0b: a new design is named by its own name (Size help), never the bare "Design" key.
  const newDesigns = now && prev ? (now.designs ?? []).filter((d) => !(prev.designs ?? []).some((p) => p.id === d.id)).map((d) => d.name) : []
  const added = now && prev ? [...now.allowed.sections.filter((s) => s !== 'design' && !prev.allowed.sections.includes(s)).map((s) => SECTION_NAMES[s]), ...newDesigns] : []
  const newFeatures = now && prev ? now.features.filter((f) => !prev.features.includes(f)) : now?.features ?? []
  const older = all.filter((x) => x.key === key && cmpSemver(x.version, version) < 0).reduce((n, x) => n + x.live, 0)
  const results = admin && sp.q ? await shopsNamed(staff, sp.q) : []
  const final = v.state === 'recalled' || v.state === 'withdrawn'
  const hidden = <><input type="hidden" name="key" value={key} /><input type="hidden" name="version" value={version} /></>
  return (
    <>
      <PageHeader title={`${v.name} ${v.version}`} back={{ href: '/admin/themes', label: 'Themes' }} meta={<span className="inline-flex items-center gap-2"><StateBadge state={v.state} /> {v.live} shop{v.live === 1 ? '' : 's'} live on it</span>} />
      <Notice ok={sp.ok} error={sp.error} />
      {!admin && <p className="mb-3 text-sm text-muted-foreground">Only an admin can stage, release, recall or withdraw a theme version.</p>}
      <Section title="What’s in it">
        {!v.inCode && <p className="text-sm text-danger-text">This version is no longer in the deployed code; shops on it render the nearest earlier version.</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm">{newFeatures.map((f) => <li key={f}>{f}</li>)}</ul>
        {prev && <p className="mt-2 text-sm text-muted-foreground">Since {prev.version}: {added.length ? `new section${added.length > 1 ? 's' : ''} ${added.join(', ')}` : 'no new sections'}. Shops on {prev.version} keep everything they made when they move to it.</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          {v.releasedAt && <>Released {dayIN(v.releasedAt)}. </>}
          {v.recalledAt && <>Recalled {dayIN(v.recalledAt)}: {v.recalledReason}. </>}
          {v.withdrawnAt && <>Withdrawn {dayIN(v.withdrawnAt)}: {v.withdrawnReason}.</>}
        </p>
      </Section>

      <Section title="Pilot shops">
        {v.staged.length ? <ul className="space-y-2 text-sm">{v.staged.map((s) => (
          <li key={s.tenantId} className="flex items-center gap-3"><span className="flex-1">{s.name}</span>
            {admin && <form action={unstageAction}>{hidden}<input type="hidden" name="tenantId" value={s.tenantId} /><Submit variant="secondary">Unstage</Submit></form>}
          </li>))}</ul> : <p className="text-sm text-muted-foreground">Not staged to any shop.</p>}
        {admin && !final && v.state !== 'released' && v.inCode && <>
          <form method="get" className="mt-3 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="q">Find a shop</label>
            <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Shop name" className={`${input} w-56`} />
            <Button type="submit" variant="secondary">Find</Button>
          </form>
          {results.length > 0 && <ul className="mt-2 space-y-2 text-sm">{results.map((s) => (
            <li key={s.id} className="flex items-center gap-3"><span className="flex-1">{s.name} <span className="text-muted-foreground">{s.slug}</span></span>
              <form action={stageAction}>{hidden}<input type="hidden" name="tenantId" value={s.id} /><Submit>Stage to {s.name}</Submit></form>
            </li>))}</ul>}
        </>}
      </Section>

      {admin && v.inCode && <Section title="Decisions">
        <div className="space-y-4">
          {!final && v.state !== 'released' && (
            <form action={releaseAction} className="space-y-2">{hidden}
              <p className="text-sm">Every shop can try it. {older > 0 ? `${older} shop${older === 1 ? ' is' : 's are'} live on an older ${v.name}: they’ll see that it’s ready, and nothing changes until they publish.` : ''}</p>
              <Submit>Release to everyone</Submit>
            </form>
          )}
          {!final && !isBaseline(key, version) && (
            <form action={pullAction} className="space-y-2">{hidden}<input type="hidden" name="how" value="recall" />
              <p className="text-sm">Recall: no new looks on it. {v.live} shop{v.live === 1 ? '' : 's'} live on it keep showing it and are offered their previous look. Final.</p>
              <label className="sr-only" htmlFor="recall-why">Why recall it</label>
              <input id="recall-why" name="reason" required minLength={3} maxLength={300} placeholder="Why, in a few words" className={`${input} w-full max-w-md`} />
              <Submit variant="secondary">Recall {v.name} {v.version}</Submit>
            </form>
          )}
          {v.state !== 'withdrawn' && !isBaseline(key, version) && (
            <form action={pullAction} className="space-y-2">{hidden}<input type="hidden" name="how" value="withdraw" />
              <p className="text-sm text-danger-text">Withdraw, for a problem shoppers must not see: {v.live} shop{v.live === 1 ? '' : 's'} show their previous look at once. Final.</p>
              {v.liveShops.length > 0 && <p className="text-sm">Moves back: {v.liveShops.slice(0, 20).map((s) => s.name).join(', ')}{v.liveShops.length > 20 ? `, and ${v.liveShops.length - 20} more` : ''}.</p>}
              <label className="sr-only" htmlFor="withdraw-why">Why withdraw it</label>
              <input id="withdraw-why" name="reason" required minLength={3} maxLength={300} placeholder="The problem, in a few words" className={`${input} w-full max-w-md`} />
              <Submit variant="destructive">Withdraw {v.name} {v.version}</Submit>
            </form>
          )}
          {isBaseline(key, version) && <p className="text-sm text-muted-foreground">Classic 1.0.0 is every shop’s fallback look: it can’t be recalled or withdrawn.</p>}
        </div>
      </Section>}
    </>
  )
}
