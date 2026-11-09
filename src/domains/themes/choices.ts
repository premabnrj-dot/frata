import type { ChoiceKey, ThemeManifest, ThemeSettings } from './types'

// =============================================================================
// FILE: src/domains/themes/choices.ts — THE one answer to "which values may this theme use for this setting",
// read by resolveTheme (what renders) and the customizer's forms (what is offered). Pure.
// A manifest lists its values in allowed.choices. A key it leaves out gets BASE_CHOICES: for a setting every theme
// always had, null (any value, today's rule); for a setting or value added with the 2.0 themes, only what every
// theme rendered before it. So a 1.x theme can never render a 2.0 value, after a recall, a revert or a theme switch
// (architecture review 2026-11-09, finding 2).
// =============================================================================

export const BASE_CHOICES: { [K in ChoiceKey]?: readonly ThemeSettings[K][] } = {
  buttons: ['solid', 'outline'],
  gallery: ['swipe', 'thumbs'],
  buttonShape: ['theme'], buttonMotion: ['press'], cardHover: ['none'], entrance: ['none'], reveal: [false],
  buyBoxSticky: [false], buyBar: [false], footerScheme: ['paper'], checkout: ['standard'],
}

/** The values `m` allows for `key`; null = any value the schema accepts. */
export function choicesFor<K extends ChoiceKey>(m: Pick<ThemeManifest, 'allowed'>, key: K): readonly ThemeSettings[K][] | null {
  return (m.allowed.choices?.[key] as ThemeSettings[K][] | undefined) ?? BASE_CHOICES[key] ?? null
}

/** The choices the customizer's forms ask a theme about (2.0: a theme offers its own values; one value is no choice). */
export const CHOICE_FORM_KEYS = ['corners', 'buttons', 'phoneColumns', 'gallery', 'buttonShape', 'buttonMotion', 'cardHover', 'entrance', 'reveal', 'buyBoxSticky', 'buyBar', 'footerScheme', 'checkout'] as const satisfies readonly ChoiceKey[]
export type Choices = { [K in (typeof CHOICE_FORM_KEYS)[number]]: readonly ThemeSettings[K][] | null }
/** What `m` offers for every choice the forms show. */
export const choicesOf = (m: Pick<ThemeManifest, 'allowed'>): Choices => Object.fromEntries(CHOICE_FORM_KEYS.map((k) => [k, choicesFor(m, k)])) as Choices
