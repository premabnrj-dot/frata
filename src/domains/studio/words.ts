// =============================================================================
// FILE: src/domains/studio/words.ts — WHAT THE CHAT SAYS FOR A TURN (states mockup docs/mockups/2026-11-22-studio-runtime-
// states.html, approved 2026-11-23: states 2–6 and 9). A tool's work line, done and running ("Read the brand",
// "Checking the colours"); a turn's state from its timestamps (src/domains/studio/turn.ts); a refused Send in words
// (state 6). Limits are words, never money (call 1). Pure.
// =============================================================================

import type { ToolName } from './tools'

export const WORK_WORDS: Record<ToolName, { done: string; running: string }> = {
  store_facts: { done: 'Read the brand', running: 'Reading the brand' },
  tokens_propose: { done: 'Checked the colours', running: 'Checking the colours' },
  logo_propose: { done: 'Checked the logo', running: 'Checking the logo' },
  preview_build: { done: 'Asked for a preview', running: 'Asking for a preview' },
}

export const STUDIO_WORDS = {
  closedTitle: 'Studio isn’t open yet',
  closedLine: 'Frrata is testing it on one store.',
  closedAction: 'Open Clients',
  empty: 'No requests yet',
  working: 'Working · you can still type',
  paused: { title: 'This request reached its limit', line: 'Nothing more ran. What’s done is kept.', action: 'Continue request' },
  day: { title: 'Studio reached today’s limit', line: 'Ask again from 12:00 am.' },
  failed: { title: 'We couldn’t finish this request', line: 'Nothing was changed.', action: 'Try again' },
  previewTitle: 'Store preview',
  previewTag: 'Drafts included',
  noCode: { title: 'No code yet', line: 'Code shows here once websites are hosted.' },
  noChecks: { title: 'No checks yet', line: 'Checks run when a version is built.' },
} as const

/** A refused Send, as the composer says it (state 6); null: the chat shows it another way, or nothing to say. */
export function refusedWords(why: string): string | null {
  switch (why) {
    case 'sessions': return 'Three requests are running. Send this when one finishes.'
    case 'person_day':
    case 'platform_day': return 'Studio reached today’s limit. Ask again from 12:00 am.'
    case 'turn_open': return 'The agent is still working. Send this when it finishes.'
    case 'limit': return 'Too many requests this hour. Try again in a few minutes.'
    case 'busy': return 'That didn’t go through. Try again.'
    case 'input': return 'Type a request.'
    case 'closed': return 'Studio isn’t open yet.'
    default: return null // start, send, budget, error: the turn's own card (state 5)
  }
}
