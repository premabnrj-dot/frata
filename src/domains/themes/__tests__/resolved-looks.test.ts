import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { resolveTheme, settingAttrs, settingVars } from '../resolve'
import stored from './fixtures/stored-sections-v1.json'

// What every released theme RESOLVES to, for an empty layer and a full one (theme Signal plan T0, architecture review
// finding 12): a new setting value, scheme or section option added for one theme must not move another theme's
// resolved look. A change here is a bug unless it is a NEW version's snapshot, added on purpose (vitest -u).
const full = {
  settings: { pairing: 'playfair', headings: 'upper', size: 'large', corners: 'round', buttons: 'outline', spacing: 'compact', photo: '1:1', hoverPhoto: true,
    phoneColumns: 3, header: 'centred', sticky: false, bottomTabs: true, footer: 'compact', social: false, motion: 'none', brandColour: '#1F4E79',
    gallery: 'thumbs', details: 'folded', card: 'centred', desktopColumns: 3, collectionTop: 'banner', buttonShape: 'pill', buttonMotion: 'lift',
    cardHover: 'zoom', entrance: 'fade', reveal: true, buyBoxSticky: true, buyBar: true, footerScheme: 'ink', checkout: 'focused' },
  home: stored,
}

describe('resolved looks of every released theme', () => {
  const all = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
  it.each(all.flatMap((m) => [[`${m.key}@${m.version} · empty`, m, {}], [`${m.key}@${m.version} · full`, m, full]] as const))('%s', (_k, m, extra) => {
    const t = resolveTheme(m, { style: m.styles[0]!.key, ...(extra as object) })
    expect(JSON.parse(JSON.stringify({ settings: t.settings, schemes: t.schemes, home: t.home, attrs: settingAttrs(t), vars: settingVars(t) }))).toMatchSnapshot()
  })
})
