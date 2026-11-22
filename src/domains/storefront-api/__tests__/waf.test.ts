// The API host's WAF path rule (ops/firewall.json) lets through every route this build serves and nothing else, so a
// bad shape never starts a function (unit-economics review 2026-11-15). The rule is entered by hand: this keeps the file
// in step with the routes.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { newKey } from '../keys'

const fw = JSON.parse(readFileSync('ops/firewall.json', 'utf8')) as { rules: { name: string; active: boolean; conditionGroup: { conditions: { type: string; value: string; neg?: boolean }[] }[] }[] }
const rule = fw.rules.find((r) => r.name === 'Storefront API: refuse any other path')!
const re = new RegExp(rule.conditionGroup[0]!.conditions.find((c) => c.type === 'path')!.value)
const rnd = (n: number) => new Uint8Array(randomBytes(n))
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' ? [p] : [] })

describe('the API host’s path rule', () => {
  it('is first and on, and the kill switch is there and off', () => {
    expect(fw.rules[0]?.name).toBe('Storefront API: refuse any other path')
    expect(rule.active).toBe(true)
    expect(fw.rules.find((r) => r.name === 'Storefront API: kill switch (off)')?.active).toBe(false)
  })
  it('lets every served route through, with real values', () => {
    const k = newKey('public', rnd), t = newKey('test', rnd)
    const fill = (route: string, key: string) => '/' + route.replace(/^src\/app\/api\/storefront\//, '').replace(/\/route\.ts$/, '')
      .replace(/^(\d{4}-\d{2})\/[kt]\//, '$1/k/').replace('[key]', key).replace('[handle]', 'linen-kurta-set').replace('[n]', '13')
    const header = (route: string) => '/' + route.replace(/^src\/app\/api\/storefront\//, '').replace(/\/route\.ts$/, '')
      .replace(/^(\d{4}-\d{2})\/h\//, '$1/').replace('[handle]', 'linen-kurta-set').replace('[n]', '13')
    for (const r of walk('src/app/api/storefront')) {
      if (/\/h\//.test(r)) { expect(re.test(header(r)), header(r)).toBe(true); continue } // G·2: the key in the header
      for (const key of [k, t]) expect(re.test(fill(r, key)), fill(r, key)).toBe(true)
    }
  })
  it('lets the header tree through with no key in the path, and nothing else beside the resources (G·2)', () => {
    for (const p of ['/2026-12/shop', '/2026-12/products/page/2', '/2026-12/pages/about', '/2026-12/filter/page/1']) expect(re.test(p), p).toBe(true)
    for (const p of ['/2026-12/orders', '/2026-12/preview/faq', '/2026-12/h/shop', '/2026-12/shop/x', '/2026-12/products/page/14']) expect(re.test(p), p).toBe(false)
  })
  it('lets the docs through (SA1b D·9)', () => {
    for (const p of ['/', '/docs', '/docs/bag-link', '/docs/reference/products-handle', '/llms.txt', '/_next/static/chunks/app-1a2b.js', '/_next/static/css/x.css']) expect(re.test(p), p).toBe(true)
    for (const p of ['/api-docs', '/docs/a/b/c', '/docs/Bad', '/admin', '/console', '/_next/image', '/llms.txt.bak']) expect(re.test(p), p).toBe(false)
  })
  it('refuses a bad shape, page or handle', () => {
    const k = newKey('public', rnd)
    for (const p of [`/2026-12/k/frs_pub_short/shop`, `/2026-12/k/${k}/products/page/14`, `/2026-12/k/${k}/products/page/0`, `/2026-12/k/${k}/products/Bad_Handle`,
      `/2026-12/k/${k}/orders`, `/2026-12/k/${k}/pages/Bad_Page`, `/2026-12/k/${k}/pages/${'a'.repeat(61)}`, `/2026-12/k/${k}/faq/x`, `/2026-12/k/${k}/shop/x`, `/2025-01/k/${k}/shop`, '/2026-12/openapi.json/x',
      `/2026-12/k/${k}/preview`, `/2026-12/k/${k}/preview/products/x`, `/2026-12/k/${k}/preview/v1.abc.def/faq`, `/2026-12/k/${k}/preview/pages/${'a'.repeat(61)}`]) expect(re.test(p), p).toBe(false)
  })
})
