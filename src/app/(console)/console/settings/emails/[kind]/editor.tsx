'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { PLACEHOLDERS } from '@/domains/messaging/placeholders'
import { WORD_LIMITS, type EmailWords } from '@/domains/email/words'
import { saveEmailAction, sendTestAction } from '../actions'

const FIELDS: { key: keyof EmailWords; label: string; area?: boolean; max: number }[] = [
  { key: 'subject', label: 'Subject', max: WORD_LIMITS.subject }, { key: 'preview', label: 'Preview line', max: WORD_LIMITS.preview }, { key: 'heading', label: 'Heading', max: WORD_LIMITS.heading },
  { key: 'message', label: 'Message', area: true, max: WORD_LIMITS.message }, { key: 'button', label: 'Button', max: WORD_LIMITS.button },
]

/** Words in fields; placeholders chosen from the menu, never typed; Save, Revert to Frrata's words, Send test to me. */
export function Editor({ kind, words, defaults, on, readOnly }: { kind: string; words: EmailWords; defaults: EmailWords; on: boolean; readOnly: boolean }) {
  const [w, setW] = useState(words)
  const [focus, setFocus] = useState<keyof EmailWords>('message')
  const toast = useToast()
  const [pending, start] = useTransition()
  const router = useRouter()
  const refs = useRef<Partial<Record<keyof EmailWords, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const field = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm'
  const insert = (p: string) => {
    const el = refs.current[focus], token = `[${p}]`
    const at = el?.selectionStart ?? w[focus].length
    setW((x) => ({ ...x, [focus]: x[focus].slice(0, at) + token + x[focus].slice(el?.selectionEnd ?? at) }))
  }
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done: string) => start(async () => {
    const r = await fn()
    if (r.ok) { toast.ok(r.message ?? done); router.refresh() } else toast.error(r.error ?? 'Something went wrong.')
  })
  return (
    <div className="grid gap-3 text-sm">
      {FIELDS.map((f) => (
        <label key={f.key} className="grid gap-1"><span className="font-medium">{f.label}</span>
          {f.area
            ? <textarea ref={(el) => { refs.current[f.key] = el }} rows={4} maxLength={f.max} value={w[f.key]} disabled={readOnly} onFocus={() => setFocus(f.key)} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} className={field} />
            : <input ref={(el) => { refs.current[f.key] = el }} maxLength={f.max} value={w[f.key]} disabled={readOnly} onFocus={() => setFocus(f.key)} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} className={`${field} h-10 md:h-9`} />}
        </label>
      ))}
      {!readOnly ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Insert:
          {PLACEHOLDERS.map((p) => <button key={p} type="button" onClick={() => insert(p)} className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground hover:bg-accent">{p}</button>)}
        </p>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => act(() => saveEmailAction(kind, w, on), 'Saved.')}>Save</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => act(() => sendTestAction(kind, w), 'Sent.')}>Send test to me</Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setW(defaults); act(() => saveEmailAction(kind, null, on), 'Back to Frrata’s words.') }}>Revert to Frrata’s words</Button>
        </div>
      ) : null}
    </div>
  )
}
