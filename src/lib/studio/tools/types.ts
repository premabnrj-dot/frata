import type { ProposalKind } from '@/domains/studio/proposals'

/** What a tool hands back: the answer the agent reads (our words or data, never a vendor's or a database's) and, for a
 *  proposal, the value a person may apply. The runner (./index.ts) writes both in one transaction. */
export type ToolOutcome = { answer: unknown; isError: boolean; proposal?: { kind: ProposalKind; value: unknown } }
export const refused = (words: string): ToolOutcome => ({ answer: { error: words }, isError: true })
