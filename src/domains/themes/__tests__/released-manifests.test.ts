import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'

// A released version's content never changes (themes plan T3·5). check:themes holds each manifest FILE's bytes;
// this holds what the file evaluates to, so a change in something a manifest imports (kit.ts, an earlier version it
// builds on) fails too. A new version adds a snapshot; an existing one changing is a bug: make a new version.
describe('released theme manifests', () => {
  const all = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
  it.each(all.map((m) => [`${m.key}@${m.version}`, m] as const))('%s is as released', (_k, m) => {
    expect(JSON.parse(JSON.stringify({ styles: m.styles, defaults: m.defaults, allowed: m.allowed, home: m.home }))).toMatchSnapshot()
  })
})
