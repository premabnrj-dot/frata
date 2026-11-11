import { normaliseMobile } from './mobile'

// =============================================================================
// FILE: src/domains/settings/whatsapp.ts — THE ONE wa.me LINK to a shop's WhatsApp number (security review
// 2026-11-11, H1). Settings stores an Indian mobile as 10 digits; wa.me reads its leading digits as a country code,
// so a link without 91 opened a chat with a stranger abroad. Every shop and console link is built here. Pure.
// =============================================================================

/** `https://wa.me/91XXXXXXXXXX` (with `?text=` when given), or null when the number isn't an Indian mobile. */
export function waLink(stored: string | null | undefined, text?: string): string | null {
  const d = stored ? normaliseMobile(stored) : null
  if (!d) return null
  return `https://wa.me/91${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
