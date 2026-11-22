// The header tree (G·2; ADR-0018's build-key amendment): every h/ route is described, by its keyless path, under the
// buildKey scheme in the Frrata-Key header; none takes a key in the path; a build key's shape is its own kind.
import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { openApi } from '../2026-12/openapi'
import { KEY_HEADER, keyShape, newKey, shownPrefix } from '../keys'

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' ? [p] : [] })
const H = 'src/app/api/storefront/2026-12/h'

describe('the header tree', () => {
  const doc = openApi() as unknown as { components: { securitySchemes: Record<string, { type: string; in: string; name: string }> }; paths: Record<string, { get: { security?: unknown; parameters: { name: string; in: string }[] } }> }
  it('describes every h/ route under the header scheme, with no key in the path', () => {
    expect(doc.components.securitySchemes.buildKey).toMatchObject({ type: 'apiKey', in: 'header', name: KEY_HEADER })
    const routes = walk(H).map((f) => f.slice(H.length).replace(/\/route\.ts$/, '').replace(/\[(\w+)\]/g, '{$1}'))
    expect(routes.length).toBeGreaterThan(10)
    for (const r of routes) {
      expect(doc.paths[r], r).toBeDefined()
      expect(doc.paths[r]!.get.security, r).toEqual([{ buildKey: [] }])
      expect(doc.paths[r]!.get.parameters.some((p) => p.in === 'path' && p.name === 'key'), r).toBe(false)
    }
    // and every keyless path described is served (no preview under the header tree)
    for (const p of Object.keys(doc.paths).filter((x) => !x.startsWith('/k/'))) expect(routes, p).toContain(p)
  })
  it('a build key has its own shape and shown prefix', () => {
    const k = newKey('build', (n) => new Uint8Array(randomBytes(n)))
    expect(k).toMatch(/^frs_build_[0-9A-Za-z]{38}$/)
    expect(keyShape(k)).toEqual({ kind: 'build' })
    expect(shownPrefix(k)).toMatch(/^frs_build_[0-9A-Za-z]{6}$/)
    expect(keyShape(k.replace('frs_build_', 'frs_test_'))).toBeNull() // the checksum covers the kind
  })
})
