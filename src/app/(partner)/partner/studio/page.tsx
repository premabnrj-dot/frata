import Link from 'next/link'
import type { Metadata } from 'next'
import { button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Panel } from '@/components/ui/panel'
import { Submit } from '@/components/ui/submit'
import { Toaster } from '@/components/ui/toast'
import { STUDIO_WORDS as W } from '@/domains/studio/words'
import { switchStoreAction } from '@/app/choose/actions'
import { requirePartner } from '@/lib/auth/require-partner'
import { brandPage } from '@/lib/queries/brand'
import { EMPTY_CHAT, studioChat } from '@/lib/queries/studio'
import { studioEntry, type StudioStep } from '@/lib/studio/with-studio'
import { errName } from '@/lib/log'
import { StudioApp } from './_live/studio-app'
import { BrandRead } from './_live/brand-read'
import { ConfirmPasskeys } from './_live/confirm-passkeys'

// =============================================================================
// /partner/studio — STUDIO, FOR FRRATA STAFF ON ONE TEST STORE (plan docs/plans/2026-11-22-v3a-runtime.md R7; ADR-0020).
// Outside the workspace's shell (Studio is a screen of its own; its top bar goes back to Clients). Who may: requireStudio
// (the switch, staff and partner checks on one browser session, the partner role on the switcher's store, never a
// support visit); anyone else reads state 1. The page's actions follow a Send for 20 s (maxDuration 60).
// =============================================================================
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = { title: 'Studio', robots: { index: false } }

function Closed() {
  return (
    <main data-neel="" className="grid min-h-dvh place-items-center bg-background p-4 text-sm text-foreground">
      <Panel title={W.closedTitle} action={<Link href="/partner" className={button({ size: 'sm' })}>{W.closedAction}</Link>}>{W.closedLine}</Panel>
    </main>
  )
}

/** The step a person who is staff and a partner still needs (owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html
 *  1a–1c). Anyone else reads Closed. */
function Step({ step }: { step: StudioStep }) {
  const frame = (panel: React.ReactNode) => <Toaster><main data-neel="" className="grid min-h-dvh place-items-center bg-background p-4 text-sm text-foreground">{panel}</main></Toaster>
  if (step.kind === 'store') {
    // Several partner stores: today's card, whose Open Clients lists them (a Deviation: the drawing shows one store).
    const one = step.stores.length === 1 ? step.stores[0]! : null
    if (!one) return <Closed />
    return frame(<Panel title={`Studio runs on ${one.name}`} action={
      <form action={switchStoreAction}>
        <input type="hidden" name="tenantId" value={one.tenantId} /><input type="hidden" name="to" value="/partner/studio" />
        <Submit size="sm">Open {one.name}</Submit>
      </form>} />)
  }
  if (step.kind === 'staff_passkey') return frame(<Panel title="Add a staff passkey" action={<Link href="/admin" className={button({ size: 'sm' })}>Add staff passkey</Link>} />)
  return frame(
    <Panel title="Confirm your passkeys" action={<ConfirmPasskeys staff={step.staff} partner={step.partner} />}>
      <ol className="grid list-decimal gap-1.5 pl-5 text-left text-muted-foreground">
        <li>{step.staff ? 'Staff passkey: Done' : 'Staff passkey'}</li>
        <li>{step.partner ? 'Partner passkey: Done' : 'Partner passkey'}</li>
      </ol>
    </Panel>,
  )
}

export default async function StudioPage() {
  // A partner person, or one whose partner check is still to make (the entry states); anyone else reads Closed.
  const partner = await requirePartner()
  if (!partner.ok && partner.reason !== 'needs_passkey') return <Closed />
  const auth = await studioEntry()
  if (!auth.ok) return auth.reason === 'step' ? <Step step={auth.step} /> : <Closed />
  const [chat, brand] = await Promise.all([
    studioChat(auth, null).catch((e) => { console.error('[studio] page', errName(e)); return EMPTY_CHAT }),
    brandPage(auth.tenantId, new Date()),
  ])
  return (
    <Toaster>
      <h1 className="sr-only">Studio</h1>
      <StudioApp store={auth.tenantName} chat={chat} version={brand.version} design={<BrandRead brand={brand.brand?.record ?? null} />} empty={{
        feed: <Empty title={W.empty}><span className="text-muted-foreground">{auth.tenantName} · test store</span></Empty>,
        code: <Empty title={W.noCode.title}><span className="text-muted-foreground">{W.noCode.line}</span></Empty>,
        checks: <Empty title={W.noChecks.title}><span className="text-muted-foreground">{W.noChecks.line}</span></Empty>,
        versions: <Empty title="No versions yet" />,
      }} />
    </Toaster>
  )
}
