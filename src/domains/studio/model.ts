// =============================================================================
// FILE: src/domains/studio/model.ts — THE ONE MODEL STUDIO'S AGENT RUNS ON (plan docs/plans/2026-11-22-v3a-runtime.md
// ruling a; owner, 2026-11-22: "just use haiku model for now for the agent for testing … only for studio model").
// Spec § 7's model returns only for the 20-task proof, on the orchestrator's word, and brings its own caps
// (src/domains/studio/spend.ts: check:studio fails a model without a row). The agent file
// (studio/agents/frrata-agent/agent.json) pins the same id, effort and geo; check:studio compares them.
// Model id from the claude-api skill's models table (cached 2026-11-03).
// =============================================================================

export const STUDIO_MODEL = 'claude-haiku-5-5' as const
export type StudioModel = typeof STUDIO_MODEL
/** Set explicitly: Haiku 5.5 and Opus 5.5 both default to `medium`, other models to `high`. */
export const STUDIO_EFFORT = 'medium' as const
/** The workspace's default inference geo measured `global` (spike, probe `geo`), so the agent pins `us`. */
export const STUDIO_GEO = 'us' as const
/** The agent's name in the chat (ADR-0020 point 3): never "Claude Code" or anything like it. */
export const AGENT_NAME = 'Frrata agent'
