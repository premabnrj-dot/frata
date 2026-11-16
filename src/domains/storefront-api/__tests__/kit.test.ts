import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starterCartLink } from '../../../../scripts/kit-sync.mjs'

describe('the partner kit (SA1b D·9)', () => {
  it('the starter’s bag link is the app’s own, limits written in (node scripts/kit-sync.mjs)', () => {
    expect(readFileSync('kit/starter/lib/cart-link.ts', 'utf8')).toBe(starterCartLink())
  })
  it('the starter never reads its key in the browser', () => {
    const lib = readFileSync('kit/starter/lib/frrata.ts', 'utf8')
    expect(lib).toContain("import 'server-only'")
    expect(lib).not.toMatch(/NEXT_PUBLIC_/)
  })
  // The owner's Claude Code decision (2026-11-15): the starter's own check catches the mistakes whoever wrote the code.
  const check = (dir: string) => { try { execFileSync(process.execPath, ['scripts/check.mjs'], { cwd: dir, stdio: 'pipe' }); return '' } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') } }
  it('the starter passes its own check', () => { expect(check('kit/starter')).toBe('') })
  it('the check refuses a key in source, price arithmetic, HTML from the API and a missing legal block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'starter-'))
    try {
      for (const d of ['app', 'components', 'lib', 'scripts']) cpSync(join('kit/starter', d), join(dir, d), { recursive: true })
      writeFileSync(join(dir, 'lib/bad.ts'), ["const k = 'frs_pub_" + "abcdef123456'", 'export const off = (p: { price: number }) => p.price * 0.9', 'export const html = <div dangerouslySetInnerHTML={{ __html: k }} />'].join('\n'))
      writeFileSync(join(dir, 'app/layout.tsx'), 'export default function L({ children }: { children: unknown }) { return children }')
      const out = check(dir)
      for (const want of ['a Frrata key in source', 'arithmetic on a price', 'dangerouslySetInnerHTML', 'legal.grievanceOfficer']) expect(out).toContain(want)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
