// =============================================================================
// FILE: src/domains/email/state.ts — AN EMAIL'S STATE, DERIVED FROM ITS TIMESTAMPS (no status column; CLAUDE.md "derive,
// never duplicate"). Pure. The words are what the Emails card and Admin show.
// =============================================================================

export type MessageMoments = {
  createdAt: Date; attemptedAt: Date | null; sentAt: Date | null; deliveredAt: Date | null; bouncedAt: Date | null
  complainedAt: Date | null; failedAt: Date | null; skippedAt: Date | null; skipCode: string | null; bounceKind: string | null
}
export type MessageState = 'queued' | 'sending' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'skipped'

export function messageState(m: MessageMoments): MessageState {
  if (m.complainedAt) return 'complained'
  if (m.bouncedAt) return 'bounced'
  if (m.deliveredAt) return 'delivered'
  if (m.skippedAt) return 'skipped'
  if (m.failedAt) return 'failed'
  if (m.sentAt) return 'sent'
  if (m.attemptedAt) return 'sending'
  return 'queued'
}

export const SKIP_CODES = ['suppressed', 'off', 'undone', 'cancelled', 'superseded', 'not_due', 'paid', 'no_support_email', 'shop_closed', 'capped', 'no_email'] as const
export type SkipCode = (typeof SKIP_CODES)[number]

const SKIP_WORDS: Record<SkipCode, string> = {
  suppressed: 'Not sent: this address bounced or marked you as spam',
  off: 'Not sent: switched off in Settings',
  undone: 'Not sent: the step was undone',
  cancelled: 'Not sent: the order was cancelled',
  superseded: 'Not sent: a later email said it',
  not_due: 'Not sent: no longer true',
  paid: 'Not sent: already paid',
  no_support_email: 'Not sent: add a support email in Settings',
  shop_closed: 'Not sent: the shop is not open yet',
  capped: 'Not sent: daily limit reached',
  no_email: 'No email',
}

export function stateWords(m: MessageMoments): string {
  const s = messageState(m)
  if (s === 'skipped') return SKIP_WORDS[(m.skipCode ?? 'off') as SkipCode] ?? 'Not sent'
  if (s === 'bounced') return m.bounceKind === 'permanent' ? 'Bounced: no such address' : 'Bounced'
  return { queued: 'Waiting to send', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', complained: 'Marked spam · stopped for this shop', failed: 'Could not send' }[s]
}
