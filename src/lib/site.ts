// =============================================================================
// FILE: src/lib/site.ts
//
// FRATA'S OWN PUBLIC CONTACT — shown on the website and in the console. One
// place, so a new number changes everywhere. (A shop's contact is in its
// shop_settings row, never here.)
// =============================================================================

/** Frata support on WhatsApp (owner, 2026-11-06). Digits with country code, as wa.me wants them. */
export const FRATA_WHATSAPP = '919560366601'

export const FRATA_WHATSAPP_DISPLAY = '+91 95603 66601'

/** A click-to-chat link with an opening line filled in. */
export function frataWhatsappLink(text = 'Hi Frata, I have a question about starting my shop.') {
  return `https://wa.me/${FRATA_WHATSAPP}?text=${encodeURIComponent(text)}`
}
