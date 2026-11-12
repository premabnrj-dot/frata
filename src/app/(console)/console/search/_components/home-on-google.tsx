'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { Section } from '@/components/layout/section'
import { DESCRIPTION_WARN_AT, TITLE_WARN_AT } from '@/domains/seo/defaults'
import { saveHomeSeo } from '../actions'

/** Home's title and description on Google, with the result as Google draws it; empty fields use the defaults shown. */
export function HomeOnGoogle({ initial, defaults, address }: { initial: { seoTitle: string; seoDescription: string }; defaults: { title: string; description: string }; address: string }) {
  const [d, setD] = useState(initial)
  const [saved, setSaved] = useState(initial)
  // Mistakes at the two fields, one summary toast; the save's result a toast (§ Feedback 1–3).
  const toast = useToast()
  const box = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, scope: box })
  const fix = (k: string) => setErrors((e) => { if (!(k in e)) return e; const { [k]: _gone, ...rest } = e; return rest })
  const [pending, start] = useTransition()
  const title = d.seoTitle.trim() || defaults.title
  const description = d.seoDescription.trim() || defaults.description
  const dirty = d.seoTitle !== saved.seoTitle || d.seoDescription !== saved.seoDescription
  const count = (n: number, warn: number) => <span className={n > warn ? 'text-warn-text' : ''}>{n}{n > warn ? ` · phones may cut it after about ${warn}` : ''}</span>
  const save = () => start(async () => {
    const r = await saveHomeSeo(d)
    if (!r.ok) {
      const marked = r.errors ?? {}
      if (Object.keys(marked).length) { setErrors(marked); setAttempt((a) => a + 1) } else { setErrors({}); toast.error(r.error) }
      return
    }
    setSaved(d); setErrors({}); toast.ok('Saved.')
  })
  return (
    <Section id="google" title="On Google">
      <div ref={box} className="space-y-3">
      <div className="rounded-md border border-border p-3">
        <p className="truncate text-xs text-muted-foreground">{address}</p>
        <p className="line-clamp-1 text-base text-info-text">{title}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="home-title" className="block text-sm font-medium">Page title</label>
        <input id="home-title" value={d.seoTitle} maxLength={200} placeholder={defaults.title} {...fieldProps('home-title', errors.seoTitle)} onChange={(e) => { setD({ ...d, seoTitle: e.target.value }); fix('seoTitle') }} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text" />
        <FieldError name="home-title" message={errors.seoTitle} />
        <p className="text-xs text-muted-foreground">{count(title.length, TITLE_WARN_AT)} characters</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="home-desc" className="block text-sm font-medium">Description</label>
        <textarea id="home-desc" rows={3} value={d.seoDescription} maxLength={400} placeholder={defaults.description} {...fieldProps('home-desc', errors.seoDescription)} onChange={(e) => { setD({ ...d, seoDescription: e.target.value }); fix('seoDescription') }} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm aria-invalid:border-danger-text" />
        <FieldError name="home-desc" message={errors.seoDescription} />
        <p className="text-xs text-muted-foreground">{count(description.length, DESCRIPTION_WARN_AT)} characters</p>
      </div>
      <Button disabled={pending || !dirty} onClick={save}>Save</Button>
      </div>
    </Section>
  )
}
