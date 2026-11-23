import 'server-only'
import { checkTokens, type TokensValue } from '@/domains/studio/proposals'
import { builderBrand } from '@/lib/queries/builder'
import type { TurnContext } from '@/lib/studio/as-turn'
import { refused, type ToolOutcome } from './types'

/** `tokens_propose`: checked against the live record with saveBrand's own rules before any card shows it. */
export async function tokensPropose(ctx: TurnContext, input: TokensValue): Promise<ToolOutcome> {
  const live = await builderBrand(ctx.reads)
  const c = checkTokens(live, input)
  if (!c.ok) return c.problems === 'unchanged' ? refused('That is what the store has now. Nothing was proposed.')
    : { answer: { error: 'The store would refuse this.', problems: c.problems }, isError: true }
  return { answer: { proposed: true, note: 'The person sees a card with Apply. Nothing changes until they apply it.' }, isError: false, proposal: { kind: 'tokens', value: c.value } }
}
