// WCAG 2.x contrast, for theme schemes (check:theme) and, from T1, a merchant's brand colour.
// scripts/check-contrast.mjs keeps its own copy for the console tokens: it is an .mjs gate and cannot import TS
// (accepted in the themes plan's review findings; both follow the same WCAG formula).

const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a colour: ${hex}`)
  const n = parseInt(m[1]!, 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
