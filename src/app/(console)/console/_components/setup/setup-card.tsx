import { PictoTile } from '@/components/brand/illustrations'
import type { PictogramName } from '@/components/brand/pictogram'
import { StoreCard } from '@/components/brand/store-card'
import { Section } from '@/components/layout/section'
import { nextSetupStep, type SetupStepKey } from '@/domains/setup/checklist'
import { holds, type MemberRole } from '@/domains/tenancy/roles'
import type { Setup } from '@/lib/queries/settings'
import type { StepView } from './drafts'
import { SetupActions } from './setup-actions'

// =============================================================================
// FILE: src/app/(console)/console/_components/setup/setup-card.tsx — HOME'S SETUP CARD (server)
//
// Plan docs/plans/2026-11-23-o2a-setup-card.md O2a·7, mockup § 2 "O2 · four steps": the next step large (its
// pictogram drawn here, on the server; the ring, title and button in the one island), the four steps under it, and
// beside them on a desktop the store drawing itself (the card sign-up drew). Who may act on a step is read from the
// role in hand (CAPABILITIES): a row the person may not act on is text. Nothing is read beyond setupFor.
// =============================================================================

const PICTO: Record<SetupStepKey, PictogramName> = { product: 'product', details: 'details', payments: 'payments', publish: 'store' }

/** `hideable`: Home's open card, which "Hide this card" swaps for Today (O2a·8); /console/setup has no Today to show. */
export function SetupCard({ setup, role, tenantId, hideable = false }: { setup: Setup; role: MemberRole; tenantId: string; hideable?: boolean }) {
  const can = (c: Parameters<typeof holds>[1]) => holds(role, c)
  const next = nextSetupStep(setup.steps, can)
  const steps: StepView[] = setup.steps.map((s) => ({ key: s.key, title: s.title, action: s.action, value: s.value, done: s.done, mine: can(s.who) }))
  return (
    <div className="grid items-start gap-4.5 md:grid-cols-[minmax(0,1fr)_240px]">
      <Section flush ariaLabel="Setup">
        <SetupActions steps={steps} next={next?.key ?? null} tenantId={tenantId} address={setup.address} hideable={hideable}
          picto={next || setup.open ? <PictoTile name={next ? PICTO[next.key] : 'store'} tone="haldi" /> : null} />
      </Section>
      <div aria-hidden="true" className="hidden md:block">
        <Section className="p-3.5 md:p-3.5"><StoreCard host={setup.address} name={setup.name} sell={setup.sell} open={setup.open} flat /></Section>
      </div>
    </div>
  )
}
