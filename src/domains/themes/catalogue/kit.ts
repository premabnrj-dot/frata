import type { Hex, Scheme, Style } from '../types'

// Shared building blocks for manifests: a scheme from a few colours. Theme colours live in this folder only
// (check:hex QUOTED rule); check:theme holds every scheme readable.
export const light = (bg: Hex, text: Hex, sub: Hex, line: Hex, chip: Hex, accent: Hex, onAccent: Hex = '#FFFFFF'): Scheme => ({
  bg, text, sub, line, chip, accent, onAccent, button: text, onButton: bg, good: '#1E6B47', bad: '#A8321F', sale: '#A8321F',
})
export const dark = (bg: Hex, text: Hex, sub: Hex, line: Hex, chip: Hex, accent: Hex, onAccent: Hex): Scheme => ({
  bg, text, sub, line, chip, accent, onAccent, button: text, onButton: bg, good: '#7FCBA4', bad: '#F59A86', sale: '#F59A86',
})
/** A coloured band (the style's own colour as the background): status and sale words take the text colour there. */
export const band = (bg: Hex, text: Hex, sub: Hex, line: Hex, chip: Hex, accent: Hex, onAccent: Hex): Scheme => ({
  bg, text, sub, line, chip, accent, onAccent, button: text, onButton: bg, good: text, bad: text, sale: text,
})
export const style = (key: string, name: string, schemes: Style['schemes'], schemeNames?: Style['schemeNames']): Style => ({ key, name, schemes, ...(schemeNames ? { schemeNames } : {}) })

/** The two text colours that can sit on a merchant's brand colour (the brand colour rule, layer.ts). */
export const ON_COLOUR = { light: '#FFFFFF', dark: '#1F1A17' } as const satisfies Record<string, Hex>
/** Where the brand-colour picker starts (a deep wine that reads on every light scheme). */
export const BRAND_COLOUR_START: Hex = '#7A1F2B'
