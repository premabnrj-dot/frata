import 'server-only'
import { builderStoreFacts } from '@/lib/queries/builder'
import type { TurnContext } from '@/lib/studio/as-turn'
import type { ToolOutcome } from './types'

/** `store_facts`: the store's brand, active products and collections, as frata_builder (no stock, cost, order or person). */
export async function storeFacts(ctx: TurnContext): Promise<ToolOutcome> {
  return { answer: await builderStoreFacts(ctx.reads), isError: false }
}
