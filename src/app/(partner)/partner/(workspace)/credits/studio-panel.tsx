import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { budgetState, LOW_BANNER } from '@/domains/studio/credits'
import { partnerCan } from '@/domains/partners/team'
import { CREDIT_PRICE, PACK } from '@/domains/studio/prices'
import type { PartnerOk } from '@/lib/auth/require-partner'
import { panel } from '@/lib/db/partner-credits'
import { realMoney } from '@/lib/studio/purchase'
import { formatInr } from '@/lib/format'
import { BuyCredits, RaiseBudget } from './credits-parts'

// =============================================================================
// FILE: credits/studio-panel.tsx — Studio's credits panel (C1·4; mockup "Credits in Studio", docs/mockups/2026-11-22-four-
// screens.html, approved 2026-11-22). Lane C builds it and its loader; lane D mounts it from the credits pill at V3b. The
// owner sees the balance, buys, and raises a used-up budget; a Lead or a Builder sees the client's used and budget only
// and is told to ask the owner (owner 2026-11-22, 5). `needs`: what the next page needs (V3 passes its estimate).
// Read per open, never cached (no figure in a tenant row; speed M4: V3 sends a turn's figure with its settled row).
// =============================================================================

export async function StudioCreditsPanel({ auth, linkId, client, needs }: { auth: PartnerOk; linkId: string; client: string; needs?: number }) {
  const r = await panel(auth, linkId, realMoney())
  if (!r.ok) return <p className="text-sm text-muted-foreground">We couldn’t load credits. Try again in a minute.</p>
  const p = r.value
  const used = p.budget !== null && budgetState(p.used, p.budget) === 'paused'
  const low = p.balance !== null && p.balance < LOW_BANNER
  const ownerFirst = (auth.partner.name || 'the owner').split(' ')[0] ?? 'the owner'
  const owner = partnerCan(p.role, 'credits')
  return (
    <Section title="Credits" action={used ? <Badge tone="danger">Budget used up</Badge> : p.balance !== null ? (low ? <Badge tone="warn">{p.balance}</Badge> : <Numeric>{p.balance}</Numeric>) : null}>
      <div className="grid gap-3">
      {owner && !used && low && needs ? <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">This page needs about {needs} credits</span><BuyCredits label={`Buy ${PACK.credits} credits`} /></div> : null}
      {owner && !used && !(low && needs) ? <>
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{PACK.credits} credits · {formatInr(PACK.price)} + GST</span><BuyCredits label={`Buy ${PACK.credits} credits`} /></div>
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Any amount · {formatInr(CREDIT_PRICE)} + GST a credit</span><BuyCredits variant="secondary" /></div>
      </> : null}
      {p.budget !== null && <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{client}’s budget</span><Numeric>{p.used} of {p.budget}</Numeric></div>}
      {used && (owner ? <div><RaiseBudget linkId={linkId} client={client} /></div> : <p className="text-sm text-muted-foreground">Ask {ownerFirst} to raise it.</p>)}
      {owner && !used && <div><Link href="/partner/credits" className={button({ variant: 'ghost', size: 'sm' })}>Open Credits and billing</Link></div>}
      </div>
    </Section>
  )
}
