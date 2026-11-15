// =============================================================================
// FILE: src/domains/messaging/placeholders.ts — THE WORDS A STORE MAY INSERT ([First name], [Order number]…), chosen from
// a menu, never typed as code. Pure. A line whose placeholder has no value is left out, never "undefined" (spec
// § Stress test).
// =============================================================================

export const PLACEHOLDERS = ['First name', 'Order number', 'Total', 'Store name', 'Pay on delivery', 'Courier', 'Tracking number'] as const
export type Placeholder = (typeof PLACEHOLDERS)[number]
export type Values = Partial<Record<Placeholder, string>>

/** Old names a store saved before the menu was renamed (N3 Words, 2026-11-15: "store", never "shop"). Saved email
 *  overrides and message text still name them; they fill with the new name's value, so nothing needs migrating. */
const ALIASES: Record<string, Placeholder> = { 'Shop name': 'Store name' }
const known = (name: string): Placeholder | null => (PLACEHOLDERS as readonly string[]).includes(name) ? name as Placeholder : ALIASES[name] ?? null

const TOKEN = /\[([A-Za-z ]{2,24})\]/g

/** Fills each line; drops a line naming a placeholder with no value (or an unknown one). */
export function fill(text: string, values: Values): string {
  return text.split('\n').flatMap((line) => {
    let missing = false
    const out = line.replace(TOKEN, (_, name: string) => {
      const k = known(name)
      const v = k ? values[k] : undefined
      if (!v) { missing = true; return '' }
      return v
    })
    return missing ? [] : [out]
  }).join('\n')
}

/** The placeholders a text names that are not on the menu (refused when a shop saves). */
export function unknownPlaceholders(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]!).filter((n) => !known(n))
}

/** A first name for a subject line: the first word, at most 30 characters (security review S4). */
export function firstName(full: string): string {
  return (full.trim().split(/\s+/)[0] ?? '').slice(0, 30)
}
