import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { STUDIO_ANTHROPIC_BASE, STUDIO_ANTHROPIC_KEY } from '@/lib/env'

// =============================================================================
// FILE: src/lib/studio/client.ts — STUDIO'S ONE ANTHROPIC CLIENT (plan docs/plans/2026-11-22-v3a-runtime.md R3;
// security review L1; check:config holds that no other file calls `new Anthropic(`). The SDK reads several settings
// from the environment on its own (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ANTHROPIC_LOG,
// ANTHROPIC_CUSTOM_HEADERS, ANTHROPIC_WEBHOOK_SIGNING_KEY): every one is overridden here. The key is the app's one
// Studio key (`STUDIO_ANTHROPIC_KEY`, Production only); `authToken` null; the base URL Anthropic's own (the local fake
// only off Vercel); no logging (a debug log would print request bodies, a vault credential's value among them); no SDK
// retry (the next trigger retries, § Advance); each call sets its own timeout (CALL_MS). No client without a key.
// =============================================================================

export const ANTHROPIC_BASE = 'https://api.anthropic.com'
/** Per-call deadlines (speed review H2): an event read 5 s, a control call 15 s. Inside a 60 s function. */
export const CALL_MS = { events: 5_000, control: 15_000 } as const

let made: Anthropic | null = null

/** The client, or null when Studio has no key (every caller then refuses the turn). */
export function studioClient(): Anthropic | null {
  if (!STUDIO_ANTHROPIC_KEY) return null
  if (made) return made
  made = new Anthropic({
    apiKey: STUDIO_ANTHROPIC_KEY,
    authToken: null,
    webhookKey: null,
    baseURL: STUDIO_ANTHROPIC_BASE || ANTHROPIC_BASE,
    logLevel: 'off',
    maxRetries: 0,
    timeout: CALL_MS.control,
    defaultHeaders: {},
  })
  return made
}

/** Tests only: forget the client so a test can point a new one at its own fake server. */
export function resetStudioClientForTests() { made = null }
