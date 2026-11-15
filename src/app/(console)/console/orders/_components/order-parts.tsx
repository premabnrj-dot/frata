import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import type { OrderKeep } from '@/domains/orders/kept'
import type { TopLine } from '@/domains/orders/top-line'
import { cn } from '@/lib/utils'

// =============================================================================
// THE ORDER PAGE'S PARTS (Neel N2b·1, mockup https://claude.ai/artifact/GH5xX5ss5Xb9rLc5LwyVEC, as approved). Server
// components: the top line (what to do now, in money), What you keep (only ever handed to this page for whoever sees
// costs: totals, never the breakdown), and the one timeline of notes, emails and what people did.
// =============================================================================

const TONE = { calm: 'bg-sunk', warn: 'bg-warn', bad: 'bg-danger', ok: 'bg-ok' } as const
const LINE = { calm: 'text-foreground', warn: 'text-warn-text', bad: 'text-danger-text', ok: 'text-ok-text' } as const
const RISK = { low: { bg: 'bg-ok text-ok-text', dot: 'bg-ok-mark' }, medium: { bg: 'bg-warn text-warn-text', dot: 'bg-warn-mark' }, high: { bg: 'bg-danger text-danger-text', dot: 'bg-danger-mark' } } as const

/** "Collect ₹2,290 on delivery" and its one line under it; the COD risk as a chip beside it. */
export function TopLineCard({ t, risk }: { t: TopLine; risk: 'low' | 'medium' | 'high' | null }) {
  return (
    <section aria-label="What to do" className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3.5 md:px-5', TONE[t.tone])}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className={cn('text-base font-semibold md:text-[length:var(--t-section)]', LINE[t.tone])}>{t.line}</b>
        {t.sub ? <span className="text-sm text-muted-foreground">{t.sub}</span> : null}
      </div>
      {risk ? <span className={cn('inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm font-medium', RISK[risk].bg)}><i aria-hidden="true" className={cn('size-1.5 rounded-full', RISK[risk].dot)} />COD risk: {risk}</span> : null}
    </section>
  )
}

const missingWords = { cogs: 'Add the cost of its goods to see this.', freight: 'Shows once the courier’s charges arrive.' } as const

/** What this order keeps if it is delivered, and if it comes back. Known costs only: before ads and packaging. */
export function KeepCard({ k }: { k: OrderKeep }) {
  return (
    <Section id="keep" title="What you keep">
      {k.missing && k.ifDelivered === null ? <p className="text-sm text-muted-foreground">{missingWords[k.missing]}</p> : (
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <div className="flex flex-col gap-0.5 rounded-mid bg-sunk p-3">
            <span className="text-label text-muted-foreground">If delivered</span>
            {k.ifDelivered === null ? <b className="text-title font-semibold text-muted-foreground">—</b> : <b className="font-num text-title font-semibold tabular-nums"><Money paise={k.ifDelivered} /></b>}
            <span className="text-label text-muted-foreground">After GST, goods, courier and Frrata’s fee. Before ads and packaging.</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-mid bg-danger p-3 text-danger-text">
            <span className="text-label">If it comes back</span>
            {k.ifBack === null ? <b className="text-title font-semibold">—</b> : <b className="font-num text-title font-semibold tabular-nums"><Money paise={k.ifBack} /></b>}
            <span className="text-label">Courier both ways.{k.ifBackNotStocked !== null && k.ifBackNotStocked !== k.ifBack ? <> <Money paise={k.ifBackNotStocked} /> if it can’t go back in stock.</> : null}</span>
          </div>
        </div>
      )}
      {k.fee > 0 ? <p className="text-label text-muted-foreground">Frrata’s fee <Money paise={paise(k.fee)} decimals /> only if delivered.</p> : null}
    </Section>
  )
}

export type TimelineRow = { at: Date; text: string; body?: string; who: string; when: string }

/** Notes, emails and what people did, newest first: one list (owner, 2026-11-15). The note box and the email controls sit
 * at its head; a note's text shows on its row. */
export function Timeline({ rows, head }: { rows: TimelineRow[]; head: React.ReactNode }) {
  return (
    <Section id="activity" title="Activity">
      {head}
      <ol className="flex flex-col gap-3 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col">
            <span>{r.text}</span>
            {r.body ? <span className="whitespace-pre-wrap rounded-md bg-sunk px-2.5 py-1.5 [overflow-wrap:anywhere]">{r.body}</span> : null}
            <span className="text-small text-muted-foreground">{r.who} · {r.when}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}
