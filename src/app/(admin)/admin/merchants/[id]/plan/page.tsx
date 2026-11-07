import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money } from '@/components/data/numeric'
import { Button, button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { getMerchant } from '@/lib/admin/merchants'
import { listPlans } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { formatPercent } from '@/lib/format'
import { changePlanAction } from './actions'
import { Section } from '@/components/layout/section'

export const metadata = { title: 'Change plan' }

const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

export default async function ChangePlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [m, ps] = await Promise.all([getMerchant(staff, id, new Date()), listPlans(staff)])
  if (!m) notFound()
  const { error } = await searchParams
  const cur = m.current
  return (
    <Section className="mx-auto max-w-xl"><form action={changePlanAction} className="space-y-5">
      <h1 className="text-xl font-semibold">Change {m.tenant.name}&apos;s plan</h1>
      <Notice error={error} />
      <input type="hidden" name="tenantId" value={id} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">New plan</legend>
        {ps.map((p) => {
          const v = p.versions[0]!
          const isCurrent = cur?.code === p.code && cur.v.id === v.id
          return (
            <label key={p.id} className="flex items-center justify-between rounded-md border border-input px-3 py-2.5 text-sm has-[:checked]:border-2 has-[:checked]:border-primary">
              <span className="flex items-center gap-2">
                <input type="radio" name="code" value={p.code} required defaultChecked={!isCurrent && cur?.code !== p.code && p.code === 'scale'} />
                {p.name} · version {v.version}{isCurrent && <span className="text-muted-foreground">(current)</span>}
              </span>
              <span className="text-muted-foreground"><Money paise={paise(v.monthlyPrice)} />/mo · {v.includedOrders.toLocaleString('en-IN')} orders · {formatPercent(v.feeBps / 10_000, v.feeBps % 100 === 0 ? 0 : 1)}</span>
            </label>
          )
        })}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="when" className="text-sm font-medium">Starts</label>
          <select id="when" name="when" className={field}><option value="now">Today</option><option value="next_month">The 1st of next month</option></select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trialEndsAt" className="text-sm font-medium">Trial ends <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="trialEndsAt" name="trialEndsAt" type="date" className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="customPrice" className="text-sm font-medium">Custom monthly price, ₹ <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="customPrice" name="customPrice" inputMode="numeric" className={`${field} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason" className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(needed with a custom price)</span></label>
          <input id="reason" name="reason" maxLength={200} className={field} />
        </div>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        The store moves to the current version of the plan you choose: its price, included orders, fee and features. {cur ? `Today: ${cur.name}, ${cur.v.includedOrders.toLocaleString('en-IN')} orders included.` : 'It has no plan today.'} Nothing is charged until billing arrives in Phase 6.
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href={`/admin/merchants/${id}`} className={button({ variant: 'secondary' })}>Keep {cur?.name ?? 'as it is'}</Link>
        <Button type="submit">Move {m.tenant.name}</Button>
      </div>
    </form></Section>
  )
}
