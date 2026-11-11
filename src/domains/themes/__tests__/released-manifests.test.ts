import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'

// A released version never changes, and never disappears (themes plan T3·5): a shop's look names a theme and a
// version, so a change here would change shops without a publish. This snapshots what each manifest EVALUATES to
// (so a change in kit.ts, or in a version another builds on, fails too) and the list of versions (so a removal
// fails). A new version adds its snapshot on purpose (vitest -u); an existing one changing is a bug: add a version.
describe('released theme manifests', () => {
  const all = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
  it('the versions in this build', () => expect(all.map((m) => `${m.key}@${m.version}`).sort()).toMatchSnapshot())
  it.each(all.map((m) => [`${m.key}@${m.version}`, m] as const))('%s is as released', (_k, m) => {
    expect(JSON.parse(JSON.stringify({ name: m.name, job: m.job, features: m.features, styles: m.styles, defaults: m.defaults, allowed: m.allowed, home: m.home, ...(m.designs ? { designs: m.designs } : {}) }))).toMatchSnapshot()
  })
})
