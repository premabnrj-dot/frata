import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { Panel } from '@/components/ui/panel'
import { istDayKey } from '@/domains/time/day'
import { dayMonthIN, timeIN } from '@/lib/format-date'
import { recentRates } from '@/lib/admin/fx-rate'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { RateForm } from './rate-form'

export const metadata = { title: 'Dollar rate' }
export const dynamic = 'force-dynamic'

// =============================================================================
// FILE: src/app/(admin)/admin/rate/page.tsx — Admin › Money › Dollar rate (V3b K2, plan row A1a; mockup
// docs/mockups/2026-11-24-v3b-first.html § 1, approved by the owner 2026-11-24). The day's rupees per dollar that prices
// Studio's credits (frata-unit-economics § The dollar rate), typed by a master admin; the last 7 days with who typed
// each. The banner on every Admin page (layout.tsx, rateState) warns before turns stop.
// =============================================================================

const dayOf = (key: string) => new Date(`${key}T12:00:00+05:30`)
const rupees = (rateE4: number) => (rateE4 / 10_000).toFixed(4)

export default async function RatePage() {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) {
    return staff.reason === 'not_staff'
      ? <><PageHeader title="Dollar rate" /><Section className="max-w-3xl" title="Only a master admin can enter the dollar rate" /></>
      : <><PageHeader title="Dollar rate" /><Panel title={staff.message} /></>
  }
  const today = istDayKey(new Date())
  const rows = await recentRates(staff)
  return (
    <>
      <PageHeader title="Dollar rate" />
      <div className="grid max-w-3xl gap-4">
        <Section ariaLabel="Today’s rate" id="rate-today">
          <RateForm label={`Rupees per dollar · ${dayMonthIN(dayOf(today))}`} value={rows.find((r) => r.day === today) ? rupees(rows.find((r) => r.day === today)!.rateE4) : ''} />
        </Section>
        {rows.length === 0
          ? <p className="text-sm text-muted-foreground">No rates yet</p>
          : (
              <DataTable label="The last 7 days">
                <DataTableHead><th>Day</th><th className="text-right">Rupees per dollar</th><th>Typed by</th><th>At</th></DataTableHead>
                <DataTableBody>
                  {rows.map((r) => (
                    <DataTableRow key={r.day}>
                      <Td cell="a">{dayMonthIN(dayOf(r.day))}</Td>
                      <Td cell="b" className="text-right"><Numeric>{rupees(r.rateE4)}</Numeric></Td>
                      <Td cell="c">{r.by ?? 'Frrata'}<span className="md:hidden"> · {timeIN(r.setAt)}</span></Td>
                      <Td cell="hide"><time dateTime={r.setAt.toISOString()}>{timeIN(r.setAt)}</time></Td>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
          )}
      </div>
    </>
  )
}
