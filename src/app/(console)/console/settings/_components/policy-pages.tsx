'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ShopFacts } from '@/components/shop-preview/previews'
import { missingFacts, POLICY_PAGES, renderPolicy, type PolicyPage } from '@/domains/policies/render'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { savePolicyText } from '../actions'
import { Section } from '@/components/layout/section'

const inr = (p: number) => formatInr(paise(p))
const asText = (page: PolicyPage, f: ShopFacts) =>
  renderPolicy(page, f, inr).map((para) => para.map((p) => ('text' in p ? p.text : p.value ?? `[${p.fact}]`)).join('')).join('\n\n')

/**
 * The five pages: each follows the settings until the merchant rewrites it,
 * and says which it is. Rewriting is its own save (it is not part of the
 * section's fields); "Follow my settings again" removes the rewrite.
 */
export function PolicyPages({ facts, overrides, selected, onSelect, pagesDirty }: {
  facts: ShopFacts
  overrides: Record<string, string>
  selected: PolicyPage
  onSelect: (p: PolicyPage) => void
  pagesDirty: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<PolicyPage | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (page: PolicyPage, body: string | null) => start(async () => {
    const r = await savePolicyText(page, body)
    if (!r.ok) { setError(r.error); return }
    setEditing(null); setError(null); router.refresh()
  })

  return (
    <Section flush>
      <div className="space-y-1 p-4">
        <h2 className="text-section font-semibold">Your five pages</h2>
        <p className="text-sm text-muted-foreground">Written from your settings, and kept in step with them. Need other words? Rewrite a page; it then stops following your settings. Have a lawyer read your pages once: these are a starting point.</p>
      </div>
      {POLICY_PAGES.map(([k, label]) => {
        const own = overrides[k]
        const gaps = own ? [] : missingFacts(renderPolicy(k, facts, inr))
        return (
          <div key={k} className={`border-t border-border px-4 py-3 ${selected === k ? 'bg-accent/50' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="font-medium hover:underline" onClick={() => onSelect(k)}>{label}</button>
              <Badge tone={own ? 'info' : gaps.length ? 'warn' : 'ok'}>{own ? 'Your own words' : gaps.length ? 'Missing details' : 'From your settings'}</Badge>
              <span className="flex-1" />
              {editing !== k && (
                <button type="button" className="inline-flex min-h-6 items-center text-sm underline" disabled={pagesDirty}
                  title={pagesDirty ? 'Save or discard your other changes first' : undefined}
                  onClick={() => { onSelect(k); setEditing(k); setText(own ?? asText(k, facts)); setError(null) }}>
                  {own ? 'Edit' : 'Rewrite'}
                </button>
              )}
            </div>
            {gaps.length > 0 && <p className="mt-1 text-xs text-warn-text">Needs: {gaps.join(', ')}</p>}
            {own && editing !== k && (
              <button type="button" className="inline-flex min-h-6 items-center mt-1 text-xs text-muted-foreground underline" disabled={pending} onClick={() => save(k, null)}>Follow my settings again</button>
            )}
            {editing === k && (
              <div className="mt-2 space-y-2">
                <label htmlFor={`pol-${k}`} className="sr-only">{label}</label>
                <textarea id={`pol-${k}`} rows={8} value={text} maxLength={20000} onChange={(e) => setText(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed" />
                <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs. This page will no longer change when your settings do.</p>
                {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={pending}>Keep the page as it was</Button>
                  <Button type="button" onClick={() => save(k, text)} disabled={pending || !text.trim()}>{pending ? 'Saving…' : 'Save this page'}</Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}
