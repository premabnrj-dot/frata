'use client'

import { useId, useState } from 'react'
import { uploadPhoto } from '@/app/(console)/console/products/_components/upload-photos'
import type { ThemeImage } from '@/domains/themes/sections'

// The customizer's small controls: each a labelled native control or a group of real buttons (design-language
// primitives; recognition over recall). Limits show as counters, never as a refusal after typing.

export function Field({ label, children, hint }: { label: string; children: (id: string) => React.ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const input = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm'

export function Text({ label, value, max, onChange, multiline = false }: { label: string; value: string; max: number; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <Field label={label} hint={`${value.length} / ${max}`}>
      {(id) => multiline
        ? <textarea id={id} value={value} maxLength={max} rows={4} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
        : <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={input} />}
    </Field>
  )
}

export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-md px-3 text-sm ${o.value === value ? 'border-2 border-foreground font-semibold' : 'border border-input'}`}>{o.label}</button>
        ))}
      </div>
    </fieldset>
  )
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-fast ${on ? 'bg-primary' : 'bg-input'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-card transition-transform duration-fast ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export type LinkTarget = { path: string; label: string }
export function LinkPicker({ label, value, targets, onChange, optional = true }: { label: string; value: string | null; targets: LinkTarget[]; onChange: (v: string | null) => void; optional?: boolean }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={input}>
          {optional && <option value="">No link</option>}
          {targets.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}
        </select>
      )}
    </Field>
  )
}

/** One of the shop's photos: upload (resized here, into the shop's theme folder), describe it, or remove it. */
export function ImageField({ label, value, tenantId, onChange }: { label: string; value: ThemeImage | null; tenantId: string; onChange: (v: ThemeImage | null) => void }) {
  const id = useId()
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null); setProgress(0)
    try {
      const u = await uploadPhoto(f, tenantId, setProgress, 'theme')
      onChange({ ...u, alt: value?.alt ?? '', decorative: false })
    } catch (e) { setError(e instanceof Error ? e.message : 'That photo could not be uploaded.') } finally { setProgress(null) }
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{label}</p>
      {value && <img src={`${value.base}-${value.widths[0]}.webp`} alt="" className="h-24 w-auto rounded-sm object-cover" />}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={id} className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-input px-3">{value ? 'Replace photo' : 'Upload a photo'}</label>
        <input id={id} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        {value && <button type="button" onClick={() => onChange(null)} className="min-h-9 px-2 underline underline-offset-4">Remove</button>}
        {progress !== null && <span role="status">Uploading {Math.round(progress * 100)}%</span>}
      </div>
      {value && <>
        <Text label="Describe the photo" value={value.alt} max={160} onChange={(alt) => onChange({ ...value, alt })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.decorative} onChange={(e) => onChange({ ...value, decorative: e.target.checked })} />Decorative only (a pattern, a texture)</label>
      </>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </div>
  )
}

export const rupeesToPaise = (s: string) => { const n = Number(s.replace(/[₹,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null }
export const paiseToRupees = (p: number | null) => (p === null ? '' : String(Math.round(p / 100)))
