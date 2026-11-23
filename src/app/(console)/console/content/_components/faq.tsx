'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import { FIELD } from '@/components/ui/field'
import { Icon } from '@/components/icons/icon'
import { useToast } from '@/components/ui/toast'
import { BOUND_QUESTION, type Bound } from '@/domains/policies/answers'
import { MAX_FAQ, type FaqItem } from '@/domains/pages/templates'
import { saveFaqAction, undoPageAction } from '../actions'
import { refused } from './refused'
// Closed until an edit is asked for: loaded then, so Content's first load stays inside its pin (O1·8).
const Dialog = dynamic(() => import('@/components/ui/dialog').then((m) => m.Dialog))

// =============================================================================
// Content › FAQ (final mockup § FAQ): the questions, in order, moved with ↑ ↓; an answer from Settings is read-only
// here ("From Settings" and Change in Settings). Each change saves at once (shoppers see it), with Undo for a minute.
// The FAQ page is made with its first question.
// =============================================================================

const SETTINGS = '/console/settings/contact'

export function Faq({ id, version, items, answers, canSave, lock }: { id: string | null; version: number | null; items: FaqItem[]; answers: Record<Bound, string | null>; canSave: boolean; lock: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [edit, setEdit] = useState<{ at: number | null; q: string; a: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const put = async (next: FaqItem[], said: string) => {
    setBusy(true); setError(null)
    const r = await saveFaqAction({ id, version, items: next })
    setBusy(false)
    if (!r.ok) { if (edit) setError(r.error); else refused(toast, router.refresh, r.error, () => void put(next, said)); return false }
    setEdit(null)
    toast({ text: said, undo: id ? async () => { const u = await undoPageAction({ id: r.id, version: r.version }); router.refresh(); return u } : undefined })
    router.refresh()
    return true
  }
  const swap = (i: number, j: number) => { const out = [...items]; [out[i], out[j]] = [out[j]!, out[i]!]; void put(out, 'Questions moved') }
  const missing = (Object.keys(BOUND_QUESTION) as Bound[]).filter((b) => !items.some((x) => 'bound' in x && x.bound === b))
  const save = () => {
    if (!edit) return
    if (!edit.q.trim()) { setError('Write the question.'); return }
    if (!edit.a.trim()) { setError('Write the answer.'); return }
    const item: FaqItem = { q: edit.q.trim(), a: edit.a.trim() }
    void put(edit.at === null ? [...items, item] : items.map((x, i) => (i === edit.at ? item : x)), edit.at === null ? 'Question added' : 'Question saved')
  }

  return (
    <Section ariaLabel="Questions" title={!items.length ? 'Questions' : <span className="flex items-center gap-2">Questions <Tag className="font-num">{items.length} of {MAX_FAQ}</Tag></span>}
      action={!items.length ? (canSave ? null : lock ? <Badge>{lock}</Badge> : null) : canSave ? <Button size="sm" variant="secondary" disabled={items.length >= MAX_FAQ} onClick={() => setEdit({ at: null, q: '', a: '' })}>Add a question</Button> : lock ? <Badge>{lock}</Badge> : null}>
      {!items.length
        ? <div className="grid justify-items-center gap-2 py-6 text-center"><p className="font-medium">No FAQ yet</p>{canSave && <Button onClick={() => setEdit({ at: null, q: '', a: '' })}>Add a question</Button>}</div>
        : <ol data-list className="divide-y divide-line-soft">{items.map((x, i) => (
          <li key={`${i}:${x.q}`} className="flex items-center gap-2 py-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{x.q}</p>
              <p className="mt-0.5 text-label text-muted-foreground">{'bound' in x ? <>{answers[x.bound] ?? 'Shows once Settings has what it answers.'} <Badge className="ml-1">From Settings</Badge></> : x.a}</p></div>
            {canSave && <span className="flex items-center gap-1">
              <Button size="sm" variant="secondary" aria-label={`Move ${x.q} up`} disabled={i === 0 || busy} onClick={() => swap(i, i - 1)}><Icon name="up" className="size-4" /></Button>
              <Button size="sm" variant="secondary" aria-label={`Move ${x.q} down`} disabled={i === items.length - 1 || busy} onClick={() => swap(i, i + 1)}><Icon name="down" className="size-4" /></Button>
              {'bound' in x
                ? <Button size="sm" variant="ghost" aria-label={`Remove ${x.q}`} onClick={() => void put(items.filter((_, j) => j !== i), 'Question removed')}><Icon name="close" className="size-4" /></Button>
                : <Button size="sm" variant="secondary" aria-label={`Edit ${x.q}`} onClick={() => setEdit({ at: i, q: x.q, a: x.a })}>Edit</Button>}
            </span>}
          </li>))}</ol>}
      {items.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={SETTINGS} className={button({ variant: 'secondary', size: 'sm' })}>Change in Settings</a>
        {canSave && items.length < MAX_FAQ && missing.map((b) => <Button key={b} size="sm" variant="ghost" onClick={() => void put([...items, { q: BOUND_QUESTION[b], bound: b }], 'Question added')}>Add “{BOUND_QUESTION[b]}”</Button>)}
      </div>}
      <Dialog open={!!edit} onClose={() => { setEdit(null); setError(null) }} title={edit?.at === null ? 'Add a question' : 'Edit question'} error={error}
        actions={<>{edit && edit.at !== null && <Button variant="danger" className="mr-auto" onClick={() => void put(items.filter((_, j) => j !== edit.at), 'Question removed')}>Remove</Button>}
          <Button variant="secondary" data-autofocus onClick={() => { setEdit(null); setError(null) }}>{edit?.at === null ? 'Don’t add' : 'Keep as it is'}</Button><Button busy={busy} onClick={save}>Save</Button></>}>
        {edit && <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Question<span className="font-num font-normal text-muted-foreground">{edit.q.length}/80</span></span>
            <input value={edit.q} maxLength={80} onChange={(e) => setEdit({ ...edit, q: e.target.value })} className={`${FIELD} w-full`} /></label>
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Answer<span className="font-num font-normal text-muted-foreground">{edit.a.length}/600</span></span>
            <textarea value={edit.a} maxLength={600} rows={4} onChange={(e) => setEdit({ ...edit, a: e.target.value })} className={`${FIELD} w-full py-2`} /></label>
        </div>}
      </Dialog>
    </Section>
  )
}
