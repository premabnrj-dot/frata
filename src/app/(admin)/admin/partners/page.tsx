import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { BRANDS_NOW, PARTNER_SERVICES } from '@/domains/partners/terms'
import { listPartners, partnerCounts, type PartnerView } from '@/lib/admin/partners'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { formatPhone } from '@/lib/format'
import { dateTimeIN, sinceIN } from '@/lib/format-date'
import { decidePartnerAction } from './actions'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'

export const metadata = { title: 'Partners' }

const VIEWS: [PartnerView, string][] = [['review', 'To review'], ['approved', 'Approved'], ['declined', 'Declined']]

/** Admin › Partners (approved mockup screen 4): the queue on the left, one application on the right. */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const view: PartnerView = VIEWS.some(([k]) => k === sp.view) ? (sp.view as PartnerView) : 'review'
  const [counts, rows] = await Promise.all([partnerCounts(staff), listPartners(staff, view)])
  const open = rows.find((r) => r.id === sp.id) ?? (view === 'review' ? rows[0] : undefined)
  const href = (id: string) => `/admin/partners?${view === 'review' ? '' : `view=${view}&`}id=${id}`
  return (
    <>
      <PageHeader title="Partners" />
      <ViewTabs label="Partner views" tabs={VIEWS.map(([k, label]) => ({ href: k === 'review' ? '/admin/partners' : `/admin/partners?view=${k}`, label, count: counts[k], current: k === view }))} />
      {rows.length === 0 ? <Panel title={view === 'review' ? 'Nothing to review' : `No ${view} partners`} /> : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Section flush ariaLabel="Applications"><ul data-list className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={href(r.id)} aria-current={open?.id === r.id || undefined} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 text-sm hover:bg-accent ${open?.id === r.id ? 'bg-accent' : ''}`}>
                  <span className="truncate font-medium">{r.businessName || r.name}</span>
                  <span className="text-muted-foreground">{sinceIN(r.appliedAt, new Date())}</span>
                  <span className="truncate text-muted-foreground">{r.name} · {r.city}</span>
                  <span className="text-right font-mono text-xs">{view === 'approved' ? `${r.stores} stores` : BRANDS_NOW.find(([k]) => k === r.brandsNow)?.[1]}</span>
                </Link>
              </li>
            ))}
          </ul></Section>
          {open && (
            <Section title={open.businessName || open.name}>
              <p className="-mt-3 font-mono text-xs text-muted-foreground">{open.email}</p>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt><dd>{open.name}</dd>
                <dt className="text-muted-foreground">WhatsApp</dt><dd className="font-mono">{formatPhone(open.phone)}</dd>
                <dt className="text-muted-foreground">City</dt><dd>{open.city}</dd>
                <dt className="text-muted-foreground">Does</dt><dd>{open.services.map((s) => PARTNER_SERVICES.find(([k]) => k === s)?.[1] ?? s).join(', ') || '—'}</dd>
                <dt className="text-muted-foreground">Work</dt><dd className="break-all">{open.workUrl || '—'}</dd>
                <dt className="text-muted-foreground">Brands now</dt><dd>{BRANDS_NOW.find(([k]) => k === open.brandsNow)?.[1]}</dd>
                <dt className="text-muted-foreground">Terms</dt><dd>Version {open.termsVersion}, {dateTimeIN(open.agreedAt)}</dd>
                {open.declineReason && <><dt className="text-muted-foreground">Declined</dt><dd>{open.declineReason}</dd></>}
                {open.approvedAt && <><dt className="text-muted-foreground">Stores</dt><dd className="font-mono">{open.stores}</dd></>}
              </dl>
              {view === 'review' && staff.role !== 'admin' ? <p className="text-sm text-muted-foreground">A Frrata admin decides applications.</p> : view === 'review' ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <ActionForm action={decidePartnerAction}>
                    <input type="hidden" name="id" value={open.id} /><input type="hidden" name="decision" value="approve" />
                    <Submit size="wrap" className="w-full justify-center text-center">Approve {open.businessName || open.name}</Submit>
                  </ActionForm>
                  <ActionForm action={decidePartnerAction} className="space-y-2">
                    <input type="hidden" name="id" value={open.id} /><input type="hidden" name="decision" value="decline" />
                    <label htmlFor="reason" className="block text-sm font-medium">Reason to decline</label>
                    <input id="reason" name="reason" maxLength={300} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-mark md:h-9" />
                    <FieldMessage name="reason" />
                    <Submit variant="secondary" className="w-full">Decline</Submit>
                  </ActionForm>
                </div>
              ) : <Badge tone={open.approvedAt ? 'ok' : 'neutral'}>{open.approvedAt ? 'Approved' : 'Declined'}</Badge>}
            </Section>
          )}
        </div>
      )}
    </>
  )
}
