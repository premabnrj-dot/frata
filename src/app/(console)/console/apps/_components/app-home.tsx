import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { ViewTabs } from '@/components/ui/view-tabs'
import { homeState, type Offer } from '@/domains/modules/offer'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { AppAction } from './app-action'
import { AppFacts } from './app-facts'

/**
 * One home for every app that is on (Apps A2; approved mockup "An app that is on"): the name with ONE state chip
 * (homeState, as Your apps reads it) and the app's own badge beside it; the app's own button; tabs — Overview, the
 * app's own, Usage and billing (AppFacts, not for the accountant); the body; and Turn off alone at the foot (owners and
 * admins outside a support visit; its consequences live in the confirm, never on the page).
 */
export function AppHome({ k, tab, tabs = [], badge, meta, primary, offer, worksWith, billing, canTurnOff, children }: {
  k: ModuleKey
  /** The current tab key: 'overview', one of `tabs`, or 'billing'. */
  tab: string
  tabs?: { key: string; label: string }[]
  badge?: React.ReactNode
  /** A line under the name (GST: the GSTIN, how often, when due). */
  meta?: React.ReactNode
  primary?: React.ReactNode
  offer: Offer
  worksWith: { key: ModuleKey; name: string; on: boolean }[]
  /** Whether this member sees Usage and billing (everyone but the accountant). */
  billing: boolean
  canTurnOff: boolean
  children?: React.ReactNode
}) {
  const def = MODULES[k], base = `/console/apps/${k}`, state = homeState()
  const all = [{ key: 'overview', label: 'Overview' }, ...tabs, ...(billing ? [{ key: 'billing', label: 'Usage and billing' }] : [])]
  return (
    <>
      <PageHeader title={def.name} back={{ href: '/console/apps', label: 'Apps' }} actions={primary} meta={meta}
        badges={<><Badge tone={state.tone}>{state.label}</Badge>{badge}</>} />
      <ViewTabs label={def.name} tabs={all.map((t) => ({ href: t.key === 'overview' ? base : `${base}?tab=${t.key}`, label: t.label, current: t.key === tab }))} />
      {tab === 'billing' && billing ? (
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2"><AppFacts k={k} offer={offer} worksWith={worksWith} /></div>
      ) : children}
      {canTurnOff ? (
        <div className="mt-8 flex justify-end border-t border-border pt-4">
          <AppAction k={k} name={def.name} action={{ kind: 'switch', on: true }} canManage askHref="" />
        </div>
      ) : null}
    </>
  )
}
