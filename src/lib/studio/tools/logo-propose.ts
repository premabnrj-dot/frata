import 'server-only'
import { checkLogo } from '@/domains/studio/proposals'
import type { TurnContext } from '@/lib/studio/as-turn'
import { refused, type ToolOutcome } from './types'

/** `logo_propose`: the one SVG cleaner, then outlines only; proposed as text, drawn only through <img>. */
export async function logoPropose(_ctx: TurnContext, input: { svg: string }): Promise<ToolOutcome> {
  const c = checkLogo(input.svg)
  if (!c.ok) return refused(c.words)
  return { answer: { proposed: true, note: 'The person sees the logo on a card with Apply. Nothing changes until they apply it.' }, isError: false, proposal: { kind: 'logo', value: c.value } }
}
