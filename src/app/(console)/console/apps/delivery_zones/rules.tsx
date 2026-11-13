'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Panel } from '@/components/ui/panel'
import { Toaster, useToast } from '@/components/ui/toast'
import { formatCount } from '@/lib/format'
import { settle } from '@/lib/settle'
import type { ConsoleRule } from '@/lib/queries/delivery'
import { addRuleAction, importRulesAction, previewRulesAction, removeRuleAction } from './actions'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// Delivery Zones › PIN code rules (PD·1, approved mockup "PIN code rules"): search by PIN code (server, paged at 100),
// Import CSV (a preview of counts and line errors, then the server reads the file again), Export, Add a rule. Settings'
// no-COD list shows read-only, "from Settings" (it still applies; review Arch M3). A rule beats its zone.
// =============================================================================

const WORDS: Record<ConsoleRule['rule'], string> = { no_delivery: 'Don’t deliver', prepaid_only: 'Pay online only', cod_max: 'Pay on delivery up to' }
const field = `${FIELD} w-full`

type Props = { rules: ConsoleRule[]; count: number; q: string; page: number; pages: number; fromSettings: string[]; canEdit: boolean }

export function RulesTab(props: Props) {
  return <Toaster><Rules {...props} /></Toaster>
}

function Rules({ rules, count, q, page, pages, fromSettings, canEdit }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const href = (p: number) => `/console/apps/delivery_zones?tab=rules${q ? `&q=${q}` : ''}${p > 1 ? `&page=${p}` : ''}`

  const remove = async (pin: string) => {
    setBusy(pin)
    const r = await removeRuleAction(pin).catch(() => ({ ok: false as const, error: 'We could not save that. Nothing was changed.' }))
    setBusy(null)
    if (!r.ok) { toast({ text: r.error }); return }
    toast({ text: `Rule for ${pin} removed` })
    settle(router)
  }
  const blocked = fromSettings.filter((p) => !q || p.startsWith(q))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" className="min-w-0 flex-1 sm:max-w-xs" action="/console/apps/delivery_zones">
          <input type="hidden" name="tab" value="rules" />
          <label htmlFor="r-q" className="sr-only">Search PIN codes</label>
          <input id="r-q" name="q" type="search" inputMode="numeric" maxLength={6} defaultValue={q} placeholder="Search PIN codes" className={`${field} font-mono`} />
        </form>
        <span className="flex-1" />
        {canEdit && <Button variant="secondary" onClick={() => setImporting(true)}>Import CSV</Button>}
        {canEdit && count > 0 && <a href="/console/apps/delivery_zones/export" className={button({ variant: 'secondary' })}>Export</a>}
        {canEdit && <Button onClick={() => setAdding(true)}>Add a rule</Button>}
      </div>

      {rules.length === 0 && blocked.length === 0 ? (
        <Panel title={q ? `No rule for a PIN code starting ${q}` : 'No PIN code rules yet'} />
      ) : (
        <DataTable label="PIN code rules">
          <DataTableHead><th>PIN code</th><th>Place</th><th>Rule</th><th>Why</th>{canEdit && <th><span className="sr-only">Actions</span></th>}</DataTableHead>
          <DataTableBody>
            {rules.map((r) => (
              <DataTableRow key={r.pincode}>
                <Td cell="a"><span className="font-mono">{r.pincode}</span></Td>
                <Td cell="c">{r.place ?? '—'}</Td>
                <Td cell="b">{WORDS[r.rule]}{r.rule === 'cod_max' && r.codMax ? <span className="font-num"> ₹{(r.codMax / 100).toLocaleString('en-IN')}</span> : null}</Td>
                <Td cell="e" className="text-muted-foreground">{r.note ?? '—'}</Td>
                {canEdit && <Td cell="f" className="text-right"><Button variant="ghost" disabled={busy === r.pincode} onClick={() => remove(r.pincode)}>Remove</Button></Td>}
              </DataTableRow>
            ))}
            {page === 1 && blocked.map((p) => (
              <DataTableRow key={`s-${p}`} dimmed>
                <Td cell="a"><span className="font-mono">{p}</span></Td>
                <Td cell="c">—</Td>
                <Td cell="b">Pay online only</Td>
                <Td cell="e">From Settings</Td>
                {canEdit && <Td cell="f" className="text-right"><Link href="/console/settings/payments" className={button({ variant: 'ghost' })}>Settings</Link></Td>}
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showing {formatCount((page - 1) * 100 + 1)}–{formatCount(Math.min(count, page * 100))} of {formatCount(count)}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={href(page - 1)} className={button({ variant: 'secondary' })}>Previous</Link>}
            {page < pages && <Link href={href(page + 1)} className={button({ variant: 'secondary' })}>Next</Link>}
          </span>
        </nav>
      )}

      {adding && <AddRule onClose={() => setAdding(false)} onDone={(pin) => { setAdding(false); toast({ text: `Rule for ${pin} saved` }); settle(router) }} />}
      {importing && <ImportRules onClose={() => setImporting(false)} onDone={(n) => { setImporting(false); toast({ text: `${formatCount(n)} rules imported` }); settle(router) }} />}
    </div>
  )
}

function AddRule({ onClose, onDone }: { onClose: () => void; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const [rule, setRule] = useState<ConsoleRule['rule']>('prepaid_only')
  const [max, setMax] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setError(null)
    const r = await addRuleAction({ pincode: pin, rule, codMax: rule === 'cod_max' ? Number(max.replace(/[₹,\s]/g, '')) || 0 : null, note: note.trim() || null })
      .catch(() => ({ ok: false as const, error: 'We could not save that. Nothing was changed.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(pin)
  }
  return (
    <Dialog open onClose={onClose} title="Add a rule"
      actions={<><Button variant="secondary" data-autofocus onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rule'}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="space-y-1"><label htmlFor="ar-pin" className="text-sm font-medium">PIN code</label>
          <input id="ar-pin" inputMode="numeric" maxLength={6} className={`${field} font-mono`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <div className="space-y-1"><label htmlFor="ar-rule" className="text-sm font-medium">Rule</label>
          <select id="ar-rule" className={field} value={rule} onChange={(e) => setRule(e.target.value as ConsoleRule['rule'])}>
            {(Object.keys(WORDS) as ConsoleRule['rule'][]).map((k) => <option key={k} value={k}>{WORDS[k]}</option>)}
          </select></div>
        {rule === 'cod_max' && <div className="space-y-1"><label htmlFor="ar-max" className="text-sm font-medium">Up to, ₹</label>
          <input id="ar-max" inputMode="decimal" className={field} value={max} onChange={(e) => setMax(e.target.value)} /></div>}
        <div className="space-y-1 sm:col-span-2"><label htmlFor="ar-note" className="text-sm font-medium">Why <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="ar-note" maxLength={120} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-danger-text sm:col-span-2">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function ImportRules({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<{ rows: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f: File | undefined) => {
    setPreview(null); setError(null); setText(null)
    if (!f) return
    if (f.size > 256 * 1024) { setError('The file is over 256 KB. Split it into smaller files.'); return }
    const t = await f.text()
    setName(f.name); setBusy(true)
    const r = await previewRulesAction(t).catch(() => ({ ok: false as const, error: 'We could not read the file.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setText(t); setPreview({ rows: r.rows, errors: r.errors })
  }
  const save = async () => {
    if (text === null) return
    setBusy(true)
    const r = await importRulesAction(text).catch(() => ({ ok: false as const, error: 'We could not save that. Nothing was changed.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone(r.added ?? 0)
  }
  return (
    <Dialog open onClose={onClose} title="Import PIN code rules"
      actions={<><Button variant="secondary" data-autofocus onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !preview?.rows} onClick={save}>{busy && preview ? 'Importing…' : preview?.rows ? `Import ${formatCount(preview.rows)} rules` : 'Import'}</Button></>}>
      <div className="space-y-3">
        <p className="font-mono text-xs text-muted-foreground">pincode,rule,cod_max,note</p>
        <label className={button({ variant: 'secondary' })}>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          {name || 'Choose a CSV file'}
        </label>
        {preview && (
          <Section flush ariaLabel="Preview">
            <p className="px-4 py-3 text-sm"><b>{formatCount(preview.rows)}</b> rules to add or replace{preview.errors.length ? <>, <b>{preview.errors.length}</b> lines left out</> : null}</p>
            {preview.errors.length > 0 && <ul className="border-t border-border px-4 py-2 text-xs text-danger-text">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </Section>
        )}
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </div>
    </Dialog>
  )
}
