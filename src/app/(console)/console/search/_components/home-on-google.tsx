'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/unsaved'
import { Section } from '@/components/layout/section'
import { DESCRIPTION_WARN_AT, TITLE_WARN_AT } from '@/domains/seo/defaults'
import { saveHomeSeo } from '../actions'

/** Home's title and description on Google, with the result as Google draws it; empty fields use the defaults shown. */
export function HomeOnGoogle({ initial, defaults, address }: { initial: { seoTitle: string; seoDescription: string }; defaults: { title: string; description: string }; address: string }) {
  const [d, setD] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const title = d.seoTitle.trim() || defaults.title
  const description = d.seoDescription.trim() || defaults.description
  const dirty = d.seoTitle !== saved.seoTitle || d.seoDescription !== saved.seoDescription
  const count = (n: number, warn: number) => <span className={n > warn ? 'text-warn-text' : ''}>{n}{n > warn ? ` · phones may cut it after about ${warn}` : ''}</span>
  const save = () => start(async () => {
    const r = await saveHomeSeo(d)
    if (!r.ok) { setErrors(r.errors ?? {}); setMsg({ tone: 'error', text: r.error }); return }
    setSaved(d); setErrors({}); setMsg({ tone: 'ok', text: 'Saved.' })
  })
  return (
    <Section id="google" title="On Google">
      <div className="rounded-md border border-border p-3">
        <p className="truncate text-xs text-muted-foreground">{address}</p>
        <p className="line-clamp-1 text-base text-info-text">{title}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="home-title" className="block text-sm font-medium">Page title</label>
        <input id="home-title" value={d.seoTitle} maxLength={200} placeholder={defaults.title} aria-invalid={!!errors.seoTitle || undefined} onChange={(e) => { setD({ ...d, seoTitle: e.target.value }); setMsg(null) }} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text" />
        <p className="text-xs text-muted-foreground">{count(title.length, TITLE_WARN_AT)} characters</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="home-desc" className="block text-sm font-medium">Description</label>
        <textarea id="home-desc" rows={3} value={d.seoDescription} maxLength={400} placeholder={defaults.description} aria-invalid={!!errors.seoDescription || undefined} onChange={(e) => { setD({ ...d, seoDescription: e.target.value }); setMsg(null) }} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm aria-invalid:border-danger-text" />
        <p className="text-xs text-muted-foreground">{count(description.length, DESCRIPTION_WARN_AT)} characters</p>
      </div>
      <Button disabled={pending || !dirty} onClick={save}>Save</Button>
      <Message m={msg} />
    </Section>
  )
}
