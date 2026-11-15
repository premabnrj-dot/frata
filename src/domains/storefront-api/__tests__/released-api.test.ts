// A released Storefront API version only grows (spec § 7): every field it ever answered is still answered, with the same
// type, and stays required; an enum keeps every value it had. A new optional field, or a new enum value (documented as
// "unknown values may appear"), passes. A removal, a rename, a narrowing or a field turning optional fails: that is a
// new dated version. The snapshot is written once per version and changed only on purpose (UPDATE_API=1, reviewed).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import * as S from '../2026-12/schemas'
import { openApi } from '../2026-12/openapi'
import { SENTINELS } from '../../../../scripts/cost-sentinels.mjs'

type J = Record<string, unknown>
const RESOURCES = { Shop: S.Shop, Page: S.Page, Product: S.Product, Collections: S.Collections, CollectionPage: S.CollectionPage, Offers: S.Offers, Search: S.Search, Content: S.Content, StorePage: S.StorePage, Faq: S.Faq }
const now = () => Object.fromEntries(Object.entries(RESOURCES).map(([k, s]) => [k, z.toJSONSchema(s, { io: 'output' }) as J]))
const FILE = join(__dirname, 'released', '2026-12.json')

/** Problems with `next` as a successor of `old`, by path. */
export function narrowed(old: J, next: J, at = '$'): string[] {
  const out: string[] = []
  const oldAny = (old.anyOf ?? old.oneOf) as J[] | undefined, nextAny = (next.anyOf ?? next.oneOf) as J[] | undefined
  if (oldAny || nextAny) {
    const o = oldAny ?? [old], n = nextAny ?? [next]
    for (const [i, branch] of o.entries()) {
      const fits = n.some((b) => narrowed(branch, b, `${at}|${i}`).length === 0)
      if (!fits) out.push(`${at}: an alternative (${JSON.stringify(branch).slice(0, 60)}) is no longer answered`)
    }
    return out
  }
  const types = (t: unknown) => JSON.stringify([t].flat().filter((x) => x !== undefined).sort())
  if (types(old.type) !== types(next.type)) return [`${at}: type ${types(old.type)} → ${types(next.type)}`]
  if (Array.isArray(old.enum)) {
    const gone = (old.enum as unknown[]).filter((v) => !(next.enum as unknown[] | undefined)?.includes(v))
    if (gone.length) out.push(`${at}: enum lost ${gone.join(', ')}`)
  }
  if (old.const !== undefined && old.const !== next.const) out.push(`${at}: const changed`)
  if (old.type === 'object') {
    const op = (old.properties ?? {}) as Record<string, J>, np = (next.properties ?? {}) as Record<string, J>
    const nreq = new Set((next.required ?? []) as string[])
    for (const k of Object.keys(op)) {
      if (!(k in np)) { out.push(`${at}.${k}: removed`); continue }
      if (((old.required ?? []) as string[]).includes(k) && !nreq.has(k)) out.push(`${at}.${k}: no longer always answered`)
      out.push(...narrowed(op[k]!, np[k]!, `${at}.${k}`))
    }
  }
  if (old.type === 'array') {
    if (old.items && next.items && !Array.isArray(old.items)) out.push(...narrowed(old.items as J, next.items as J, `${at}[]`))
    if (Array.isArray(old.prefixItems)) (old.prefixItems as J[]).forEach((p, i) => out.push(...narrowed(p, ((next.prefixItems ?? []) as J[])[i] ?? {}, `${at}[${i}]`)))
  }
  return out
}

describe('released version 2026-12 only grows (spec § 7)', () => {
  it('every field it answered is still answered, the same', () => {
    const current = now()
    // A missing snapshot fails (api-contract review 8): it is written only on purpose.
    if (process.env.UPDATE_API === '1') writeFileSync(FILE, JSON.stringify(current, null, 1) + '\n')
    expect(existsSync(FILE), 'the released snapshot is missing: UPDATE_API=1 writes it, on purpose').toBe(true)
    const released = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, J>
    const problems = Object.entries(released).flatMap(([k, s]) => (current[k] ? narrowed(s, current[k]!, k) : [`${k}: resource removed`]))
    expect(problems).toEqual([])
  })
  it('the checker catches a removal, a narrowing and a field turning optional', () => {
    const a = z.toJSONSchema(z.strictObject({ x: z.string(), k: z.enum(['a', 'b']), n: z.number() })) as J
    expect(narrowed(a, z.toJSONSchema(z.strictObject({ x: z.string(), k: z.enum(['a', 'b']) })) as J)).toEqual(['$.n: removed'])
    expect(narrowed(a, z.toJSONSchema(z.strictObject({ x: z.string(), k: z.enum(['a']), n: z.number() })) as J)).toEqual(['$.k: enum lost b'])
    expect(narrowed(a, z.toJSONSchema(z.strictObject({ x: z.string().optional(), k: z.enum(['a', 'b']), n: z.number() })) as J)).toEqual(['$.x: no longer always answered'])
    expect(narrowed(a, z.toJSONSchema(z.strictObject({ x: z.string(), k: z.enum(['a', 'b', 'c']), n: z.number(), more: z.string().optional() })) as J)).toEqual([])
  })
  it('the published description names no merchant cost', () => {
    const doc = JSON.stringify(openApi())
    for (const k of SENTINELS) expect(doc).not.toContain(k)
  })
})
