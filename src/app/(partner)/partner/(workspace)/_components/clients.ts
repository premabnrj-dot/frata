import 'server-only'
import { clientStage, shareWindow, type ClientStage } from '@/domains/partners/stage'
import { summarise, type BillSummary, type Deal, type OpenBill } from '@/domains/partners/bills'
import { clientNext, type ClientNext } from '@/domains/partners/next'
import { monthShare, type ShareFigure } from '@/domains/partners/share'
import { remindText } from '@/domains/partners/remind'
import { waText } from '@/domains/settings/whatsapp'
import { istDayKey } from '@/domains/time/day'
import type { PartnerRole } from '@/domains/partners/team'
import type { ClientRow } from '@/lib/db/partners'
import type { ClientBilling, ClientShare } from '@/lib/db/partner-bills'
import { formatInr } from '@/lib/format'
import { dayIN, dayMonthIN } from '@/lib/format-date'

// =============================================================================
// FILE: _components/clients.ts — one client as Clients and its page show it (P2; plan docs/plans/2026-11-16-p2-clients.md).
// Joins the three definers' rows by store and link and runs the engines once: the stage, the next step, the billing
// summary, the share's month, and the words a Remind opens WhatsApp with. Server only: a client island gets words.
// =============================================================================

/** A stage's badge tone (the words are STAGE_LABEL). */
export const STAGE_TONE: Record<ClientStage, 'neutral' | 'warn' | 'ok'> = { building: 'neutral', invited: 'warn', with_owner: 'neutral', open: 'ok', ended: 'neutral' }

export type Client = {
  row: ClientRow; stage: ClientStage; next: ClientNext | null
  deal: Deal | null; bills: BillSummary | null; billCount: number
  share: ShareFigure | null; shareBps: number | null; shareEnds: Date | null; shareStarted: boolean
}

/** An IST day key as people read it: "5 Nov", with the year only when it isn't this year's. */
export function dayWords(key: string, today: string): string {
  const d = new Date(`${key}T12:00:00+05:30`)
  return key.slice(0, 4) === today.slice(0, 4) ? dayMonthIN(d) : dayIN(d)
}

export function buildClients(rows: ClientRow[], billing: ClientBilling[], shares: ClientShare[], role: PartnerRole, now: Date): Client[] {
  const today = istDayKey(now)
  const byTenant = new Map(billing.map((b) => [b.tenantId, b]))
  const byLink = new Map(shares.map((s) => [s.linkId, s]))
  return rows.map((row) => {
    const stage = clientStage({ removedAt: row.removedAt, openInviteExpiresAt: row.inviteExpiresAt, hasOwner: row.hasOwner, firstOpenedAt: row.firstOpenedAt }, now)
    const b = role === 'owner' ? byTenant.get(row.tenantId) : undefined
    const bills = b ? summarise(b.open, today) : null
    const deal = b?.deal ?? null
    const next = clientNext({ stage, bills, deal, ownerSince: row.ownerSince ? istDayKey(row.ownerSince) : null, inviteSentOn: row.inviteSentAt ? istDayKey(row.inviteSentAt) : null }, role, today)
    const s = byLink.get(row.linkId)
    const w = row.shareMonths !== null && row.noticeDays !== null ? shareWindow({ shareMonths: row.shareMonths, noticeDays: row.noticeDays }, row.firstOpenedAt, row.removedAt) : null
    return {
      row, stage, next, deal, bills, billCount: b?.bills ?? 0,
      share: role === 'owner' ? monthShare(s?.month ?? null, s?.bps ?? 0) : null, shareBps: s?.bps ?? null,
      shareEnds: w && w !== 'not_started' ? w.endsAt : null, shareStarted: !!w && w !== 'not_started',
    }
  })
}

/** The next step in words, or '' when the button says it (building) or nothing waits. */
export function nextWords(c: Client, today: string, now: Date): string {
  const n = c.next
  if (!n) return ''
  switch (n.reason) {
    case 'overdue': return `${formatInr(c.bills!.overdue)} overdue · ${n.days === 1 ? '1 day' : `${n.days} days`}`
    case 'invited': case 'notOpen': return n.days === undefined ? 'Waiting' : n.days < 1 ? 'Waiting since today' : `Waiting ${n.days === 1 ? '1 day' : `${n.days} days`}`
    case 'renews': return `Next bill ${dayWords(c.deal!.renewsOn!, today)}`
    case 'dueSoon': return `${formatInr(c.bills!.nextDue)} due ${dayWords(c.bills!.nextDueOn!, today)}`
    case 'removed': return c.shareEnds && c.shareEnds > now ? `Share ends ${dayMonthIN(c.shareEnds)}` : ''
    default: return ''
  }
}

/** Who acts first: you, then the client, then nobody; removed last. The list's order below 9 clients. */
export const WHO_ORDER = { you: 0, client: 1, nobody: 2 } as const
export function byWho(a: Client, b: Client): number {
  const ka = a.stage === 'ended' && a.next?.who !== 'you' ? 3 : WHO_ORDER[a.next?.who ?? 'nobody']
  const kb = b.stage === 'ended' && b.next?.who !== 'you' ? 3 : WHO_ORDER[b.next?.who ?? 'nobody']
  return ka - kb || a.row.name.localeCompare(b.row.name, 'en-IN', { numeric: true })
}

/** The Remind link: WhatsApp on the partner's own phone with the drafted words, no number (owner Q4; ADR-0010). */
export function remindHref(c: Client, from: { person: string; business: string }, oldest: OpenBill | null, today: string): string | null {
  if (c.next?.action !== 'remind') return null
  if (c.next.reason === 'overdue' && oldest) {
    return waText(remindText({ kind: 'bill', number: null, label: 'your bill', amountText: formatInr(oldest.amount), dueText: dayWords(oldest.dueOn, today) }, c.row.name, from))
  }
  return waText(remindText({ kind: c.next.reason === 'invited' ? 'invite' : 'open' }, c.row.name, from))
}
