import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readStoredSignup } from '@/domains/signup/stored'
import { StorePreview } from '../_components/store-preview'

// A name read back from sessionStorage is shown as text only (security review of O1, 2026-11-23).
describe('a stored name with markup', () => {
  const name = '<img src=x onerror=alert(1)>'
  const back = readStoredSignup(JSON.stringify({ name, slug: 'noor-threads', slugEdited: false, arrivedAt: 1 }), 2)!
  it('renders as text in the preview', () => {
    const html = renderToStaticMarkup(createElement(StorePreview, { name: back.name, slug: back.slug, shopDomain: 'frrata.shop', sell: null }))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
  })
  it('feeds no style and no dangerouslySetInnerHTML anywhere in sign-up (the done screen included)', () => {
    for (const f of ['signup-flow.tsx', '_components/store-preview.tsx', '_components/address-dialog.tsx', '_components/email-step.tsx']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML/)
      expect(src, f).not.toMatch(/style=\{/)
    }
  })
})
