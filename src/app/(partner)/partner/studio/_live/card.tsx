'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { DENSITY_NAMES, FONT_NAMES, ROLE_NAMES, type ColourRole, type Density, type Font } from '@/domains/brand/record'
import type { ChatCard } from '@/lib/queries/studio'

// A proposal's card (the chat's cards, approved 16 Nov; states mockup state 9, approved 2026-11-23): what the agent
// proposes, drawn with its exact value; Apply runs the console's own save as this person; Not this sets it aside. A logo
// is drawn only through <img> (a cleaned, outline-only SVG as data). Refused: "Not applied", the save's words, Reload Brand.

type TokensValue = { palette?: Partial<Record<ColourRole, string>>; display?: Font; body?: Font; radius?: number; density?: Density }
type Row = { label: string; value: string; swatch?: string }

function rowsOf(v: TokensValue): Row[] {
  const out: Row[] = []
  for (const [role, hex] of Object.entries(v.palette ?? {})) out.push({ label: ROLE_NAMES[role as ColourRole] ?? role, value: String(hex), swatch: String(hex) })
  if (v.display) out.push({ label: 'Headings font', value: FONT_NAMES[v.display] ?? v.display })
  if (v.body) out.push({ label: 'Body font', value: FONT_NAMES[v.body] ?? v.body })
  if (v.radius !== undefined) out.push({ label: 'Corners', value: `${v.radius} px` })
  if (v.density) out.push({ label: 'Spacing', value: DENSITY_NAMES[v.density] ?? v.density })
  return out
}

/** The save's words for a brand changed since, said for what this card changes (state 9). */
const refusedLine = (card: ChatCard) => card.reason && /^The brand changed since you opened it\./.test(card.reason)
  ? `The brand changed since you opened it. Reload to see the new ${card.kind === 'logo' ? 'logo' : 'colours'}.` : card.reason

export function ProposalCard({ card, busy, onApply, onDismiss, onReload }: {
  card: ChatCard; busy: boolean; onApply: () => void; onDismiss: () => void; onReload: () => void
}) {
  const title = card.kind === 'logo' ? 'Logo for Brand' : 'Colours for Brand'
  const rows = card.kind === 'tokens' ? rowsOf((card.value ?? {}) as TokensValue) : []
  const svg = card.kind === 'logo' ? (card.value as { svg?: string } | null)?.svg ?? '' : ''
  const open = card.state === 'open' || card.state === 'refused'
  const left = open ? 1 : 0
  return (
    <section aria-label={title} className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label font-semibold">{title}</h3>
        <span className="text-small text-muted-foreground">{left ? `${left} to apply` : 'Done'}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid gap-1">
          <small className="text-small text-muted-foreground">{r.label}</small>
          <div className="flex items-center gap-1.5">
            {r.swatch ? <i aria-hidden="true" style={{ background: r.swatch }} className="size-5.5 rounded-sm border border-border" /> : null}
            <span className={r.swatch ? 'font-mono text-small' : undefined}>{r.value}</span>
          </div>
        </div>
      ))}
      {svg ? <img alt="The proposed logo" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} className="h-12 max-w-full justify-self-start object-contain" /> : null}
      {card.state === 'applied' ? <Badge tone="ok" className="justify-self-start">Applied</Badge> : card.state === 'dismissed' ? <Badge tone="neutral" className="justify-self-start">Not used</Badge> : null}
      {card.state === 'refused' ? <><Badge tone="danger" className="justify-self-start">Not applied</Badge><FieldError id={`card-${card.id}`} message={refusedLine(card)} /></> : null}
      {open
        ? <div className="flex gap-1.5">
            {card.state === 'refused'
              ? <Button size="sm" variant="secondary" onClick={onReload}>Reload Brand</Button>
              : <Button size="sm" variant="secondary" busy={busy} onClick={onApply}>Apply</Button>}
            <Button size="sm" variant="ghost" onClick={onDismiss}>Not this</Button>
          </div>
        : null}
    </section>
  )
}
