import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { FIELD } from '@/components/ui/field'
import { CATALOGUE } from '@/domains/themes/catalogue'
import { cmpSemver } from '@/domains/themes/semver'
import { isBaseline } from '@/domains/themes/release'
import { SECTION_NAMES } from '@/domains/themes/sections'
import { shopsNamed, themeVersionsForAdmin } from '@/lib/admin/themes'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN } from '@/lib/format-date'
import { DialogButton, MoreDialogs, type DialogSpec } from '../../../_components/form-dialog'
import { pullAction, releaseAction, stageAction, unstageAction } from '../../actions'
import { StateBadge } from '../../state-badge'

export const metadata = { title: 'Theme version' }

const TABS = [['pilot', 'Pilot stores'], ['inside', 'What’s in it'], ['history', 'History']] as const
type Tab = (typeof TABS)[number][0]
const stores = (n: number) => `${n} ${n === 1 ? 'store' : 'stores'}`

/** One version (Neel N4, board Theme): Release leads; Recall and Withdraw in More, each final and asking why. */
export default async function ThemeVersionPage({ params, searchParams }: { params: Promise<{ key: string; version: string }>; searchParams: Promise<{ q?: string; tab?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ key, version }, sp, adminRole] = await Promise.all([params, searchParams, requireStaff(ADMIN_ONLY)])
  const all = await themeVersionsForAdmin(staff)
  const v = all.find((x) => x.key === key && x.version === version)
  if (!v) notFound()
  const admin = adminRole.ok
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? (v.state === 'staged' || v.state === 'deployed' || v.state === 'added' ? 'pilot' : 'inside')
  const prev = Object.values(CATALOGUE[key] ?? {}).filter((m) => cmpSemver(m.version, version) < 0).sort((a, b) => cmpSemver(b.version, a.version))[0] ?? null
  const now = CATALOGUE[key]?.[version] ?? null
  // TS0b: a new design is named by its own name (Size help), never the bare "Design" key.
  const newDesigns = now && prev ? (now.designs ?? []).filter((d) => !(prev.designs ?? []).some((p) => p.id === d.id)).map((d) => d.name) : []
  const added = now && prev ? [...now.allowed.sections.filter((s) => s !== 'design' && !prev.allowed.sections.includes(s)).map((s) => SECTION_NAMES[s]), ...newDesigns] : []
  const newFeatures = now && prev ? now.features.filter((f) => !prev.features.includes(f)) : now?.features ?? []
  const older = all.filter((x) => x.key === key && cmpSemver(x.version, version) < 0).reduce((n, x) => n + x.live, 0)
  const results = admin && sp.q ? await shopsNamed(staff, sp.q) : []
  const final = v.state === 'recalled' || v.state === 'withdrawn'
  const name = `${v.name} ${v.version}`
  const hidden = <><input type="hidden" name="key" value={key} /><input type="hidden" name="version" value={version} /></>
  const why = (label: string, err: string) => <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span><input name="reason" required minLength={3} maxLength={300} data-error={err} className={FIELD} /><FieldMessage name="reason" /></label>
  const base = `/admin/themes/${key}/${version}`

  const more: DialogSpec[] = admin && v.inCode && !isBaseline(key, version) ? [
    ...(!final ? [{ label: 'Recall…', title: `Recall ${name}?`, description: `No new looks on it. ${stores(v.live)} live on it keep showing it and are offered their previous look. Final.`, action: pullAction, keep: 'Keep it', go: `Recall ${name}`,
      fields: <>{hidden}<input type="hidden" name="how" value="recall" />{why('Why recall it', 'Say why, in a few words.')}</> }] : []),
    ...(v.state !== 'withdrawn' ? [{ label: 'Withdraw…', title: `Withdraw ${name}?`, danger: true, action: pullAction, keep: 'Keep it', go: `Withdraw ${name}`,
      description: <>{stores(v.live)} show their previous look at once. Final.{v.liveShops.length > 0 && <> Moves back: {v.liveShops.slice(0, 20).map((s) => s.name).join(', ')}{v.liveShops.length > 20 ? `, and ${v.liveShops.length - 20} more` : ''}.</>}</>,
      fields: <>{hidden}<input type="hidden" name="how" value="withdraw" />{why('Why withdraw it', 'Say what the problem is, in a few words.')}</> }] : []),
  ] : []

  return (
    <>
      <PageHeader title={name} back={{ href: '/admin/themes', label: 'Themes' }}
        badges={v.state === 'staged' ? <Badge tone="info">Pilot · {stores(v.staged.length)}</Badge> : <StateBadge state={v.state} />}
        meta={`${v.live ? `${stores(v.live)} live on it · ` : ''}${prev ? `New in ${v.version} · ${added.length ? `${added.length} ${added.length === 1 ? 'section' : 'sections'}` : 'no new sections'}` : 'First version'}`}
        actions={<>
          <MoreDialogs specs={more} />
          {admin && v.inCode && !final && v.state !== 'released' && (
            <DialogButton variant="primary" spec={{ label: 'Release to every store', title: `Release ${name} to every store?`, action: releaseAction, keep: 'Not yet', go: 'Release', fields: hidden,
              description: older > 0 ? `${stores(older)} live on an older ${v.name} see that it’s ready. Nothing changes until they publish.` : 'Every store can try it.' }} />
          )}
        </>} />
      {/* feedback-ok: a state of the version (not in the deployed code), not the result of a button */}
      {!v.inCode && <p className="text-sm text-danger-text">This version is no longer in the deployed code. Stores on it show the nearest earlier version.</p>}

      <ViewTabs label={name} tabs={TABS.map(([k, label]) => ({ href: `${base}?tab=${k}`, label, count: k === 'pilot' ? v.staged.length || undefined : undefined, current: tab === k }))} />

      {tab === 'pilot' && <div className="space-y-3 text-sm">
        {admin && !final && v.state !== 'released' && v.inCode && <>
          <form method="get" className="flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="pilot" />
            <label className="sr-only" htmlFor="q">Find a store</label>
            <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Store name" className={`${FIELD} w-56`} />
            <Button type="submit" variant="secondary">Add pilot store</Button>
          </form>
          {results.length > 0 && <ul className="divide-y divide-line-soft">{results.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{s.name} <span className="text-muted-foreground">{s.slug}</span></span>
              <ActionForm action={stageAction}>{hidden}<input type="hidden" name="tenantId" value={s.id} /><Submit>Add {s.name}</Submit></ActionForm>
            </li>))}</ul>}
        </>}
        {v.staged.length ? <ul className="divide-y divide-line-soft">{v.staged.map((s) => (
          <li key={s.tenantId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{s.name}</span>
            {admin && <ActionForm action={unstageAction}>{hidden}<input type="hidden" name="tenantId" value={s.tenantId} /><Submit variant="secondary">Remove {s.name}</Submit></ActionForm>}
          </li>))}</ul> : <Panel title="No pilot stores" />}
      </div>}

      {tab === 'inside' && <div className="space-y-2 text-sm">
        <ul className="list-disc space-y-1 pl-5">{newFeatures.map((f) => <li key={f}>{f}</li>)}</ul>
        {prev && <p className="text-muted-foreground">Since {prev.version}: {added.length ? added.join(', ') : 'no new sections'}. Stores on {prev.version} keep everything they made.</p>}
        {isBaseline(key, version) && <p className="text-muted-foreground">Every store’s fallback look. It can’t be recalled or withdrawn.</p>}
      </div>}

      {tab === 'history' && (v.releasedAt || v.recalledAt || v.withdrawnAt ? (
        <ul className="divide-y divide-line-soft text-sm">
          {v.releasedAt && <li className="flex justify-between gap-3 py-2"><span>Released to every store</span><span className="text-muted-foreground">{dayMonthIN(v.releasedAt)}</span></li>}
          {v.recalledAt && <li className="flex justify-between gap-3 py-2"><span>Recalled · {v.recalledReason}</span><span className="text-muted-foreground">{dayMonthIN(v.recalledAt)}</span></li>}
          {v.withdrawnAt && <li className="flex justify-between gap-3 py-2"><span>Withdrawn · {v.withdrawnReason}</span><span className="text-muted-foreground">{dayMonthIN(v.withdrawnAt)}</span></li>}
        </ul>
      ) : <Panel title="Nothing decided yet" />)}
    </>
  )
}
