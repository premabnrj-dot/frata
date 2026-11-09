import 'server-only'
import { reviewsOnWhatsApp } from './reviews/inbound'

// =============================================================================
// FILE: src/lib/modules/hooks.ts — what other modules do with a WhatsApp item once Communication stored it
// (check:modules HOOKS). Communication never imports a module that depends on it; it calls these, in order.
// A handler failing never loses the item: it is stored first, and a handler is idempotent.
// =============================================================================

export const WHATSAPP_HANDLERS: ((tenantId: string, field: string, value: unknown, now: Date) => Promise<void>)[] = [
  reviewsOnWhatsApp,
]
