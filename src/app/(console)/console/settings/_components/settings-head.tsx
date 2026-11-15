import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { ViewTabs } from '@/components/ui/view-tabs'
import { groupOf, mayOpen, pageHref, pageTitle, type PageKey } from '@/domains/settings/groups'
import type { MemberRole } from '@/domains/tenancy/roles'

/**
 * Every settings page opens the same way (owner, 2026-11-15; mockup board "A section · its group's tabs"): "Settings ›
 * <group>" above the title, then the group's other pages as tabs, only those this person may open (none with one).
 */
export function SettingsHead({ page, role, actions, badges, meta }: { page: PageKey; role: MemberRole; actions?: ReactNode; badges?: ReactNode; meta?: ReactNode }) {
  const g = groupOf(page)
  const pages = g.pages.filter((p) => mayOpen(p, role))
  return (
    <div className="space-y-4">
      <PageHeader title={pageTitle(page)} trail={[{ href: '/console/settings', label: 'Settings' }, { href: `/console/settings?group=${g.key}`, label: g.name }]}
        actions={actions} badges={badges} meta={meta} />
      {pages.length > 1 ? <ViewTabs label={g.name} tabs={pages.map((p) => ({ href: pageHref(p), label: pageTitle(p), current: p === page }))} /> : null}
    </div>
  )
}
