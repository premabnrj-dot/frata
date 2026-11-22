// Fails the build when anything key-shaped reaches the browser: the key is server only (FRRATA_KEY).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const walk = (d) => { try { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] }) } catch { return [] } }
const hits = walk('.next/static').filter((f) => /frs_(pub|test|build)_/.test(readFileSync(f, 'latin1')))
if (hits.length) { console.error(`A Frrata key reached the browser:\n  ${hits.join('\n  ')}`); process.exit(1) }
console.log('scan-bundle: no key in .next/static')
