import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button, button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { DEFAULT_SUPPORT_MIN, SUPPORT_LENGTHS_MIN, SUPPORT_REASON_LABEL, SUPPORT_REASONS } from '@/domains/support/session'
import { getMerchant } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { startSupportAction } from './actions'
import { Section } from '@/components/layout/section'

export const metadata = { title: 'Open a console as support' }

const LEN_LABEL: Record<number, string> = { 30: '30 minutes', 60: '1 hour', 240: '4 hours' }
const chip = 'flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-2 has-[:checked]:border-primary'

export default async function SupportStartPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const m = await getMerchant(staff, id, new Date())
  if (!m) notFound()
  const owner = m.members.find((x) => x.role === 'owner')
  return (
    <Section className="mx-auto max-w-lg"><form action={startSupportAction} className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Open {m.tenant.name}&apos;s console as Frrata support</h1>
        <p className="text-sm text-muted-foreground">{owner?.email ?? 'The owner'} sees this visit in {m.tenant.name}&apos;s activity. Everything you change is recorded with your name and this reason.</p>
      </div>
      <input type="hidden" name="tenantId" value={id} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Why</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_REASONS.map((r, i) => (
            <label key={r} className={chip}><input type="radio" name="reason" value={r} defaultChecked={i === 0} required />{SUPPORT_REASON_LABEL[r]}</label>
          ))}
        </div>
        <label htmlFor="note" className="block pt-2 text-sm font-medium">Note for the record</label>
        <input id="note" name="note" maxLength={200} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" />
        <p className="text-xs text-muted-foreground">{m.tenant.name} can read this note. Keep staff-only remarks out of it.</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">For how long</legend>
        <div className="flex gap-2">
          {SUPPORT_LENGTHS_MIN.map((n) => (
            <label key={n} className={chip}><input type="radio" name="minutes" value={n} defaultChecked={n === DEFAULT_SUPPORT_MIN} />{LEN_LABEL[n]}</label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">It ends by itself. You can end it sooner from the banner. Starting this ends any other visit you have open.</p>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href={`/admin/merchants/${id}`} className={button({ variant: 'secondary' })}>Stay in Admin</Link>
        <Button type="submit">Open {m.tenant.name}&apos;s console</Button>
      </div>
    </form></Section>
  )
}
