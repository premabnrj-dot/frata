import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archivePath, tarOf } from '../archive'

// Starter 0's archive: tar unpacks it, the same files give the same bytes, and a path outside the archive is refused.
const f = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) })
describe('the starter archive', () => {
  it('unpacks with tar, byte for byte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tar-'))
    const tar = join(dir, 'a.tar')
    writeFileSync(tar, tarOf([f('app/page.tsx', 'export default 1\n'), f('package.json', '{}'), f('empty.txt', '')]))
    expect(execFileSync('tar', ['-tf', tar], { encoding: 'utf8' }).trim().split('\n')).toEqual(['app/page.tsx', 'empty.txt', 'package.json'])
    execFileSync('tar', ['-xf', tar, '-C', dir])
    expect(readFileSync(join(dir, 'app/page.tsx'), 'utf8')).toBe('export default 1\n')
  })
  it('is deterministic', () => {
    expect(tarOf([f('b', '2'), f('a', '1')])).toEqual(tarOf([f('a', '1'), f('b', '2')]))
  })
  it('refuses absolute, parent and over-long paths', () => {
    for (const p of ['/etc/passwd', '../x', 'a/../b', 'a//b', 'x'.repeat(101)]) expect(archivePath(p)).toBeNull()
    expect(() => tarOf([f('../x', '')])).toThrow()
  })
})
