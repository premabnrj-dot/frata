import { Panel } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { requireMember } from '@/lib/auth/require-member'
import { websitePage } from '@/lib/queries/website'
import { pageRoles } from '@/domains/settings/groups'
import { keyAnswers, keyState, lastUsed, mayManageApi, MAX_LIVE_KEYS } from '@/domains/storefront-api/keys'
import { dayMonthIN } from '@/lib/format-date'
import { API_HOST, shopHost } from '@/lib/public-env'
import { CURRENT_API_VERSION } from '@/domains/storefront-api/versions'
import { holds, ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'
import { errName } from '@/lib/log'
import { SettingsHead } from '../_components/settings-head'
import { WebsiteView, type KeyView } from './website-view'

// =============================================================================
// Console › Settings › Website (V1 Storefront API SA1·1; mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm,
// docs/mockups/2026-11-15-storefront-keys.html, approved 2026-11-15). Where the brand's website runs, its checkout
// address, and the keys its own website reads the store with. Who may change it: `api.manage`, a partner only while
// the store has no owner, never a support visit; the rest of `api.manage` see it read-only.
// =============================================================================

export const metadata = { title: 'Website' }

export default async function WebsitePageRoute() {
  // The capability's roles (CAPABILITIES['api.manage']): a Builder never holds it, so this is no Builder door.
  const auth = await requireMember(pageRoles('website'))
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or a manager can open this' : auth.message} />
  const t = auth.membership.tenantId
  const page = await websitePage(t).catch((e) => { console.error('[website]', errName(e)); return null })
  if (!page) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const now = new Date()
  const role = auth.membership.role
  const canManage = !auth.membership.supportSessionId && mayManageApi(role, page.hasOwner)
  const who = (uid: string | null) => {
    const p = uid ? page.people[uid] : undefined
    return p ? (p.partnerName ?? ROLE_LABEL[p.role as MemberRole] ?? null) : null
  }
  const keys: KeyView[] = page.keys.map((k) => {
    const s = keyState(k, page, now)
    const maker = k.partnerId ? who(k.createdBy) : null
    // Each line as the computer shows it, and as a phone does (`phone` null: left out there; mockup § Phone).
    const line: KeyView['line'] = []
    const when = (at: string) => (now.getTime() - new Date(at).getTime() < 60_000 ? 'Just now' : dayMonthIN(new Date(at))) // clock-ok: server render
    if (s.kind === 'deleted') line.push({ text: `Deleted by ${who(k.revokedBy) ?? 'someone who left'} · ${when(s.at)}`, phone: when(s.at) })
    else if (s.kind === 'partner_gone') { const t = s.at ? `Your partner’s access ended · ${dayMonthIN(new Date(s.at))}` : 'Your partner’s access ended'; line.push({ text: t, phone: t }) }
    else if (s.kind === 'ended' && s.why === 'opened' && s.at) { const t = `Store opened · ${dayMonthIN(new Date(s.at))}`; line.push({ text: t, phone: t }) }
    else if (s.kind === 'ended' && s.at) { const t = dayMonthIN(new Date(s.at)); line.push({ text: t, phone: t }) }
    else {
      if (maker) line.push({ text: `Made by ${maker}`, phone: null })
      const u = lastUsed(k.lastSeenOn, now, dayMonthIN); line.push({ text: u, phone: u })
    }
    const chip = s.kind === 'live' ? 'Live' : s.kind === 'test' ? `Test · ends ${dayMonthIN(new Date(s.endsAt))}` : s.kind === 'ended' ? 'Test · ended' : 'Deleted'
    return { id: k.id, name: k.name, prefix: `${k.prefix}…`, chip, live: keyAnswers(s), isPublic: k.kind === 'public', line }
  })
  const site = page.siteOrigin ? page.domains.find((d) => d.id === page.siteDomainId) ?? null : null
  const main = page.domains.find((d) => d.main) ?? null
  return (
    <>
      <SettingsHead page="website" role={role} badges={canManage ? undefined : <Badge tone="neutral">View only</Badge>} />
      <div className="mt-4">
      <WebsiteView
        canManage={canManage}
        canEditAddress={!auth.membership.supportSessionId && holds(role, 'shop.manage')}
        saved={page.siteOrigin && site ? { domainId: site.id, www: page.siteOrigin === `https://www.${site.apex}` } : null}
        options={page.domains.flatMap((d) => [{ domainId: d.id, www: false, label: `https://${d.apex}` }, ...(d.withWww ? [{ domainId: d.id, www: true, label: `https://www.${d.apex}` }] : [])])}
        checkout={main ? { host: main.host, razorpayOk: main.razorpayOk, custom: true } : { host: shopHost(page.slug), razorpayOk: false, custom: false }}
        maxKeys={MAX_LIVE_KEYS}
        keys={keys}
        liveCount={keys.filter((k) => k.live).length}
        testAllowed={!page.firstOpenedAt}
        openapi={API_HOST ? `https://${API_HOST}/${CURRENT_API_VERSION}/openapi.json` : null}
      />
      </div>
    </>
  )
}
