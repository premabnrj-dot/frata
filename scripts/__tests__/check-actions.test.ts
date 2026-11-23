import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// check:actions holds a public entry point to exactly its named exports (O1·7, security review 2026-11-23).
describe('check:actions exact exports', async () => {
  const { exactExportProblems, exportedNames } = await import('../check-actions.mjs')
  const FILE = 'src/app/start/check-address-open.ts'
  const real = readFileSync(FILE, 'utf8')

  it('the anonymous address check passes as it is', () => {
    expect(exactExportProblems(FILE, real)).toEqual([])
  })
  it('a second export planted in it fails the gate, in any form', () => {
    for (const plant of [
      'export async function peek(s: string) { return s }',
      'export const peek = async () => 1',
      'const peek = 1\nexport { peek }',
      "export * from '@/lib/db/platform'",
      'export default async function () {}',
    ]) expect(exactExportProblems(FILE, `${real}\n${plant}\n`).join('\n'), plant).toMatch(/exports .*holds exactly checkAddressOpen/)
  })
  it('an export named only in a comment is not one', () => {
    expect(exportedNames('// export async function peek() {}\n/* export const x = 1 */')).toEqual([])
  })
  it('losing its one export is said too', () => {
    expect(exactExportProblems(FILE, real.replace('export async function checkAddressOpen', 'async function checkAddressOpen')).join('\n')).toMatch(/no longer exports checkAddressOpen/)
  })
})
