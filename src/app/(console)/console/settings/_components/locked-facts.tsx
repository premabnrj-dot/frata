import type { ReactNode } from 'react'
import { Facts } from '@/components/data/facts'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { STATE_CODE } from '@/domains/checkout/states'
import { OWNER_ONLY_WORDS } from '@/domains/settings/owner-only'
import type { Field, Values } from '@/domains/settings/sections'
import { formatPhone } from '@/lib/format'

const STATE_NAME = Object.fromEntries(Object.entries(STATE_CODE).map(([name, code]) => [code, name])) as Record<string, string>

/**
 * A block's locked fields as facts (PP1 mockup screens 1–3; owner decision 5: facts, never disabled inputs): the label in
 * text 2 with its (i) where the field has one, the value as the store holds it. A radio card reads as its choice with the
 * card's note under it, a switch as On or Off, a code in mono. `chip`: a block where only these fields are locked says so
 * beside each value (Invoices and slips).
 */
export function LockedFacts({ fields, values, chip = false }: { fields: Field[]; values: Values; chip?: boolean }) {
  return (
    <Facts className="grid-cols-[120px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={fields.map((f) => [
      <span key="l" className="inline-flex items-center">{f.label}{f.tip ? <InfoTip about={f.label.toLowerCase()}>{f.tip}</InfoTip> : null}</span>,
      chip ? <span key="v" className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">{valueOf(f, values[f.key])}<Badge>{OWNER_ONLY_WORDS.chip}</Badge></span> : valueOf(f, values[f.key]),
    ])} />
  )
}

function valueOf(f: Field, raw: Values[string] | undefined): ReactNode {
  if (f.kind === 'switch') return raw === true ? 'On' : 'Off'
  const v = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw.trim() : ''
  if (!v) return <span className="text-muted-foreground">Not set</span>
  if (f.kind === 'radio') {
    const label = f.options?.find(([o]) => o === v)?.[1] ?? v
    const note = f.notes?.[v]
    return <>{label}{note ? <small className="block text-label text-muted-foreground">{note}</small> : null}</>
  }
  if (f.kind === 'select' || f.kind === 'segmented') return f.options?.find(([o]) => o === v)?.[1] ?? v
  if (f.kind === 'state') return STATE_NAME[v] ?? v
  if (f.kind === 'phone') return <span className="font-num">{formatPhone(`91${v}`)}</span>
  if (f.kind === 'gstin') return <span className="font-mono">{v}</span>
  if (f.kind === 'hsn' || f.kind === 'rupees' || f.kind === 'days') return <span className="font-num">{v}</span>
  if (f.kind === 'textarea') return <span className="whitespace-pre-line">{v}</span>
  return v
}
