// =============================================================================
// FILE: src/domains/email/html.ts — HTML FOR EMAIL, ESCAPED BY DEFAULT. Pure. Every interpolated value is escaped unless
// it is already `Html` (built by this helper), so a shop's words or a shopper's name can never become markup.
// =============================================================================

export class Html { constructor(readonly value: string) {} toString() { return this.value } }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!)

type Part = Html | string | number | null | undefined | false | readonly Part[]
const part = (v: Part): string => v == null || v === false ? '' : v instanceof Html ? v.value : Array.isArray(v) ? v.map(part).join('') : escapeHtml(String(v))

export function html(strings: TemplateStringsArray, ...values: Part[]): Html {
  return new Html(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''))
}

/** Text with line breaks, escaped. */
export const lines = (text: string) => new Html(text.split('\n').map(escapeHtml).join('<br>'))

/** Only https links (the shop's own; the caller builds them), else nothing. Plain http only for a `.test` or
 *  `localhost` host, which exist only in the local end-to-end run. */
export const safeHref = (href: string) => /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s"'<>]*)?$/i.test(href) || /^http:\/\/[a-z0-9.-]+\.(test|localhost)(:\d+)?(\/[^\s"'<>]*)?$/i.test(href) ? href : ''

/** A shop's colour, or the default when it isn't a 6-digit hex. */
export const safeColour = (c: string | null | undefined, fallback = '#1C1917') => c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback
