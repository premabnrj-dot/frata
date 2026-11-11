'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PLACEHOLDERS } from '@/domains/messaging/placeholders'
import type { EmailWords } from '@/domains/email/words'
import { saveEmailAction, sendTestAction } from '../actions'

const FIELDS: { key: keyof EmailWords; label: string; area?: boolean; max: number }[] = [
  { key: 'subject', label: 'Subject', max: 120 }, { key: 'preview', label: 'Preview line', max: 140 }, { key: 'heading', label: 'Heading', max: 80 },
  { key: 'message', label: 'Message', area: true, max: 600 }, { key: 'button', label: 'Button', max: 30 },
]

/** Words in fields; placeholders chosen from the menu, never typed; Save, Revert to Frrata's words, Send test to me. */
export function Editor({ kind, words, defaults, on, readOnly }: { kind: string; words: EmailWords; defaults: EmailWords; on: boolean; readOnly: boolean }) {
  const [w, setW] = useState(words)
  const [focus, setFocus] = useState<keyof EmailWords>('message')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
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
    setMsg(null)
    const r = await fn()
    setMsg(r.ok ? { ok: true, text: r.message ?? done } : { ok: false, text: r.error ?? 'Something went wrong.' })
    if (r.ok) router.refresh()
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
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-ok-text' : 'text-danger-text'}>{msg.text}</p> : null}
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
