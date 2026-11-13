'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, button } from '@/components/ui/button'
import { Badge, Tag } from '@/components/ui/badge'
import { Money } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { useToast } from '@/components/ui/toast-context'
import { paise } from '@/domains/money/paise'
import { timeIN } from '@/lib/format-date'
import { confirmKey } from '@/domains/ui/shortcuts'
import { confirmOrder, undoOrderAction } from '../orders/actions'
import { PAYMENT, RISK_LABEL } from '../orders/_components/labels'

// =============================================================================
// FILE: src/app/(console)/console/_components/next-to-confirm.tsx — HOME'S "NEXT TO CONFIRM" (Neel N1, § Screens · Home).
//
// The oldest five, one row each: the number, who and where ("Jaipur · 2 items"), how it is paid, its risk, the total,
// how long it has waited, and Confirm (the first one primary). A high-risk order, one whose risk could not be read, or
// one in another state (Refund due) says Open instead and goes to its page: a person looks first (the queue's confirmKey
// and applies, review 2026-11-07). Confirm says so in a toast with Undo; the action revalidates the console, so the row
// leaves and the counts move. While one confirm runs, the others say they are waiting (aria-disabled).
// =============================================================================

export type NextRow = {
  id: string; label: string; number: number; name: string; place: string; total: number; cod: boolean
  risk: 'low' | 'medium' | 'high' | 'unknown'; waited: string
  /** applies('confirm', state), decided on the server (one rule with the queue). */
  canConfirm: boolean
  /** A state other than "to confirm" in this tab (Refund due): its chip, and the row opens instead. */
  state: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } | null
}

export function NextToConfirm({ rows }: { rows: NextRow[] }) {
  const toast = useToast()
  const [done, setDone] = useState<Record<string, true>>({})
  const [busy, setBusy] = useState<string | null>(null)
  async function confirm(r: NextRow) {
    if (busy) return
    setBusy(r.id)
    const res = await confirmOrder(r.id).catch(() => ({ ok: false as const, error: 'We could not save that. Nothing was changed.' }))
    setBusy(null)
    if (!res.ok) {
      // The queue's words when someone else got there first: who, and when (India time).
      const by = (res as { by?: { email: string | null; at: string } }).by
      toast.error(`${r.label}: ${res.error}${by ? ` by ${by.email ?? 'someone'} at ${timeIN(new Date(by.at))}` : ''}.`)
      return
    }
    // The action revalidates the console: this row leaves and the counts move with the same response.
    setDone((d) => ({ ...d, [r.id]: true }))
    toast({ text: `${r.label} confirmed.`, undo: async () => { const u = await undoOrderAction(res.eventId); if (u.ok) setDone((d) => { const n = { ...d }; delete n[r.id]; return n }); return u } })
  }
  return (
    // Fixed columns: the name takes what is left and truncates, so a phone never scrolls sideways.
    <table aria-label="Next to confirm" className="w-full table-fixed text-sm">
      <colgroup><col className="w-22 md:w-28" /><col /><col className="hidden md:table-column md:w-44" /><col className="w-20 md:w-28" /><col className="hidden md:table-column md:w-20" /><col className="w-20 md:w-28" /></colgroup>
      <thead className="sr-only"><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Total</th><th>Waiting</th><th>Action</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const open = r.state !== null || confirmKey({ canConfirm: r.canConfirm, risk: r.risk }) === 'open'
          return (
            <tr key={r.id} data-next-order={i === 0 ? '' : undefined} className="border-b border-line-soft last:border-0 [&>td]:h-14 [&>td]:px-3 [&>td]:py-1.5 [&>td:first-child]:pl-0 [&>td:last-child]:pr-0">
              <td><Link href={`/console/orders/${r.number}`} className="font-num font-medium hover:underline">{r.label}</Link></td>
              <td className="min-w-0"><span className="block truncate"><Name>{r.name}</Name></span><span className="block truncate text-small text-muted-foreground">{r.place}</span></td>
              <td className="hidden whitespace-nowrap md:table-cell"><span className="inline-flex flex-wrap gap-1.5"><Tag>{r.cod ? PAYMENT.cod.label : PAYMENT.paid.label}</Tag>
                {r.state ? <Badge tone={r.state.tone}>{r.state.label}</Badge> : null}
                {r.risk === 'high' || r.risk === 'medium' ? <Badge tone={r.risk === 'high' ? 'danger' : 'warn'}>{RISK_LABEL[r.risk]} risk</Badge> : r.risk === 'unknown' ? <Badge>Risk unavailable</Badge> : null}</span></td>
              <td className="text-right whitespace-nowrap"><Money paise={paise(r.total)} /></td>
              <td className="hidden text-small text-muted-foreground md:table-cell">{r.waited}</td>
              <td className="text-right">
                {done[r.id] ? <span className="text-label font-medium text-ok-text">Confirmed</span>
                  : open ? <Link href={`/console/orders/${r.number}`} aria-label={`Open ${r.label}`} className={button({ variant: i === 0 ? 'primary' : 'secondary', size: 'sm' })}>Open</Link>
                  : <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} busy={busy === r.id} aria-disabled={busy !== null && busy !== r.id ? true : undefined} onClick={() => confirm(r)} aria-label={`Confirm ${r.label}`}>Confirm</Button>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
