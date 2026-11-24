import { describe, expect, it } from 'vitest'
import { refusedWords, WORK_WORDS } from '../words'
import { TOOL_NAMES } from '../tools'

// What the composer says for each refused Send (states mockup state 6, approved 2026-11-23), and a work line for every tool.
describe('Studio words', () => {
  it('a refusal the composer draws, or null where the turn’s own card says it (state 5)', () => {
    expect(refusedWords('sessions')).toBe('Three requests are running. Send this when one finishes.')
    expect(refusedWords('person_day')).toBe('Studio reached today’s limit. Ask again from 12:00 am.')
    expect(refusedWords('platform_day')).toBe(refusedWords('person_day'))
    for (const w of ['turn_open', 'limit', 'busy', 'input', 'closed']) expect(refusedWords(w)).toMatch(/\.$/)
    // V3b K3: each credit refusal has its words (Credits and billing's own), never a silent Send.
    for (const w of ['rate', 'studio_day', 'credits_day', 'client_budget', 'balance']) expect(refusedWords(w)).toMatch(/\.$/)
    for (const w of ['start', 'send', 'budget', 'error']) expect(refusedWords(w)).toBeNull()
  })
  it('every tool has its done and running line', () => {
    for (const t of TOOL_NAMES) expect(WORK_WORDS[t]).toMatchObject({ done: expect.any(String), running: expect.any(String) })
  })
})
