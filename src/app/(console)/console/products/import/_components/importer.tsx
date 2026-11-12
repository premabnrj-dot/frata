'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { matchColumns, remap, sameHeaders, sourceOf, type Field, type Mapping } from '@/domains/catalogue/import/fields'
import { rowsToFix } from '@/domains/catalogue/import/fix-file'
import type { SheetRow } from '@/domains/catalogue/import/group'
import { compactMapping } from '@/domains/catalogue/import/limits'
import { capRefusal, fileChunks, type Checked } from '@/domains/catalogue/import/plan'
import type { Sheet } from '@/domains/catalogue/import/sheet'
import type { ImportPage } from '@/lib/queries/imports'
import { checkImport, importChunk, startImport, stopImport, type SeenList } from '../actions'
import { CheckStep } from './check-step'
import { DoneStep } from './done-step'
import { FileStep } from './file-step'
import { Bar, Steps } from './parts'
import { readFile } from './read-file'

// =============================================================================
// THE IMPORT, IN THE BROWSER (plan 2026-11-12-product-import PI·1 · 6–7): the file is read here (read-file.ts) and
// grouped into whole products and chunks (group.ts, plan.ts); the rules that read prices and costs run on the server,
// once for the Check (checkImport, nothing written) and again for the import, chunk by chunk while the page is open,
// so no cost-reading code reaches the browser (check:client-bundle). Closing the page pauses the job; choosing the
// same file again continues it from its chunk, with the mapping it started with. Steps: File → Check → Import → Done.
// =============================================================================

type Loaded = { name: string; hash: string; sheet: Sheet; mapping: Mapping; chunks: SheetRow[][]; checked: Checked }
/** What a checked file adds: its new products and their sizes and colours. */
const adds = (c: Checked) => { const fresh = c.products.filter((p) => p.state === 'new'); return { products: fresh.length, variants: fresh.reduce((n, p) => n + p.variants, 0) } }

type Step =
  | { at: 'file'; error?: string; reading?: { name: string; rows: number; csv: boolean } }
  | { at: 'check'; f: Loaded; error?: string }
  | { at: 'import'; f: Loaded; jobId: string | null; next: number; total: number; added: number; error?: string }
  | { at: 'done'; f: Loaded | null; jobId: string; added: number; leftOut: number; inShop: number }

export function Importer({ data }: { data: Omit<ImportPage, 'history'> }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ at: 'file' })
  const [busy, setBusy] = useState(false)
  const [stopping, startStop] = useTransition()
  const { costs } = data.shop

  // Leaving mid-import asks first: the job stays paused, and choosing the file again continues it.
  // § Feedback: a failure after a button is the one error toast (the paused import keeps its Try again in place).
  const toast = useToast()
  const failure = 'error' in step ? step.error ?? null : null
  useEffect(() => { if (failure) toast.error(failure) }, [failure]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step.at !== 'import' || step.error) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [step])

  /** The file's chunks under a mapping, each read by the server for the Check (SKUs and barcodes carried across). */
  async function check(name: string, hash: string, sheet: Sheet, mapping: Mapping): Promise<Loaded | string> {
    const chunks = fileChunks(mapping, sheet.rows)
    const checked: Checked = { products: [], problems: [] }
    let seen: SeenList = { skus: [], gtins: [] }
    for (const rows of chunks) {
      const r = await checkImport({ mapping: compactMapping(mapping), rows, seen })
      if (!r.ok) return r.error
      checked.products.push(...r.products); checked.problems.push(...r.problems); seen = r.seen
    }
    return { name, hash, sheet, mapping, chunks, checked }
  }

  async function onFile(file: File) {
    setStep({ at: 'file', reading: { name: file.name, rows: 0, csv: !/\.xlsx$/i.test(file.name) } })
    const picked = await readFile(file, (rows) => setStep((s) => (s.at === 'file' && s.reading ? { ...s, reading: { ...s.reading, rows } } : s)))
    if (!picked.ok) return setStep({ at: 'file', error: picked.error })
    const run = data.running
    if (run && run.hash !== picked.hash) return setStep({ at: 'file', error: `Finish or stop the import of ${run.fileName} first.` })
    if (run) {
      // The same file: continue where it stopped, read as it was when it started.
      const chunks = fileChunks(run.mapping, picked.sheet.rows)
      return go({ name: picked.name, hash: picked.hash, sheet: picked.sheet, mapping: run.mapping, chunks, checked: { products: [], problems: [] } }, run.id, run.next, run.added)
    }
    const stored = data.mappings[sourceOf(picked.sheet.headers)]
    const mapping = stored && sameHeaders(stored.headers, picked.sheet.headers) ? stored : matchColumns(picked.sheet.headers, { costs })
    const f = await check(picked.name, picked.hash, picked.sheet, mapping)
    setStep(typeof f === 'string' ? { at: 'file', error: f } : { at: 'check', f })

  }

  async function onRemap(column: number, field: Field | null) {
    if (step.at !== 'check') return
    setBusy(true)
    const f = await check(step.f.name, step.f.hash, step.f.sheet, remap(step.f.mapping, column, field, { costs }))
    setBusy(false)
    if (typeof f !== 'string') setStep({ at: 'check', f })
  }

  /** Send the chunks from `from`, one at a time; a refusal pauses there, with Try again. */
  async function go(f: Loaded, jobId: string | null, from: number, added: number) {
    const { chunks } = f
    setBusy(true)
    let id = jobId, next = from, total = chunks.length, sum = added
    setStep({ at: 'import', f, jobId: id, next, total, added: sum })
    try {
      if (!id) {
        const s = await startImport({ fileName: f.name, hash: f.hash, mapping: f.mapping, chunks: chunks.length, ...adds(f.checked) })
        if (!s.ok && s.mapping) {
          // Another tab started this file with other matches: the check again, with those, and why.
          const g = await check(f.name, f.hash, f.sheet, s.mapping)
          return setStep(typeof g === 'string' ? { at: 'file', error: g } : { at: 'check', f: g, error: s.error })
        }
        if (!s.ok) return setStep({ at: 'import', f, jobId: null, next: 0, total, added: 0, error: s.error })
        id = s.jobId; next = s.next; total = s.chunks
      }
      if (total !== chunks.length) return setStep({ at: 'import', f, jobId: id, next, total, added: sum, error: 'This isn’t the file that import started with. Choose that file again, or stop it.' })
      for (let n = next; n < total; n++) {
        const r = await importChunk({ jobId: id, n, rows: chunks[n] })
        if (!r.ok) return setStep({ at: 'import', f, jobId: id, next: n, total, added: sum, error: r.error })
        sum = r.added
        setStep({ at: 'import', f, jobId: id, next: r.next, total, added: sum })
        if (r.done) {
          setStep({ at: 'done', f, jobId: id, added: r.added, leftOut: r.leftOut, inShop: r.inShop })
          router.refresh()
          return
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const fix = (f: Loaded) => () => {
    const csv = rowsToFix(f.sheet.headers, f.sheet.rows, f.checked.products.filter((p) => p.state === 'left_out'), f.checked.problems)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${f.name.replace(/\.[^.]+$/, '')} - rows to fix.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const stop = () => startStop(async () => {
    if (!data.running) return
    const r = await stopImport(data.running.id)
    setStep({ at: 'file', ...(r.ok ? {} : { error: r.error }) })
    router.refresh()
  })

  const at = step.at === 'file' ? 0 : step.at === 'check' ? 1 : step.at === 'import' ? 2 : 3
  return (
    <div className="space-y-4">
      {step.at === 'check' && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
          <span className="font-mono [overflow-wrap:anywhere]">{step.f.name}</span>
          <span><span className="font-mono tabular-nums">{step.f.sheet.rows.length.toLocaleString('en-IN')}</span> rows</span>
          <Button variant="ghost" onClick={() => setStep({ at: 'file' })}>Choose another file</Button>
        </div>
      )}
      <Steps at={at as 0 | 1 | 2 | 3} />
      {step.at === 'file' && <FileStep onFile={onFile} reading={step.reading ?? null} running={data.running} onStop={stop} stopping={stopping} />}
      {step.at === 'check' && (
        <CheckStep sheet={step.f.sheet} mapping={step.f.mapping} checked={step.f.checked} costs={costs} busy={busy}
          cap={capRefusal(adds(step.f.checked), data.shop)}
          onRemap={(c, fld) => void onRemap(c, fld)} onFix={fix(step.f)} onKeep={() => router.push('/console/products')}
          onImport={() => void go(step.f, null, 0, 0)} />
      )}
      {step.at === 'import' && (
        <Section>
          <div className="flex flex-wrap items-baseline justify-between gap-2" role="status">
            <b className="text-base">{step.error ? 'Import paused' : 'Importing'} <span className="font-mono font-normal">{step.f.name}</span></b>
            <span className="text-xs text-muted-foreground"><span className="font-mono tabular-nums">{step.added.toLocaleString('en-IN')}</span> added · part {Math.min(step.next + 1, step.total)} of {step.total}</span>
          </div>
          <Bar done={step.next} total={step.total} label={`Part ${step.next} of ${step.total} imported`} />
          {step.error && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {step.jobId
                ? <Button onClick={() => { const s = step; void go(s.f, s.jobId, s.next, s.added) }} disabled={busy}>Try again</Button>
                : <Button variant="secondary" onClick={() => setStep({ at: 'check', f: step.f })}>Back to the check</Button>}
            </div>
          )}
        </Section>
      )}
      {step.at === 'done' && (
        <DoneStep jobId={step.jobId} added={step.added} leftOut={step.leftOut} inShop={step.inShop}
          outcome={data.latest?.id === step.jobId ? data.latest.outcome : null} onFix={step.f?.checked.problems.length ? fix(step.f) : null} />
      )}
    </div>
  )
}
