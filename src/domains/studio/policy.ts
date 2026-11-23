// =============================================================================
// FILE: src/domains/studio/policy.ts — WHAT STUDIO'S AGENT AND ITS SANDBOX MAY DO (spec docs/specs/2026-11-16-studio-agent.md
// § 5; spike's binding changes; plan docs/plans/2026-11-22-v3a-runtime.md R3). The committed agent files
// (studio/agents/frrata-agent/agent.md, environment.yaml) must equal this (check:studio), and at each session's start
// the live agent version must too (runtime-managed.ts `agentMatches`): a difference refuses the start. Pure.
// =============================================================================

import { STUDIO_EFFORT, STUDIO_GEO, STUDIO_MODEL } from './model'
import { TOOL_NAMES } from './tools'

/** The only host the sandbox reaches, and the only host the vault's build key is sent to. */
export const API_HOST = 'api.frrata.shop'
export const ALLOWED_HOSTS = [API_HOST] as const
/** The header the build key travels in (ADR-0018's build-key amendment). */
export const KEY_HEADER = 'Frrata-Key'
/** The variable the vault's placeholder sits in, inside the sandbox. */
export const KEY_VARIABLE = 'FRRATA_KEY'

export const AGENT_POLICY = {
  model: STUDIO_MODEL,
  effort: STUDIO_EFFORT,
  geo: STUDIO_GEO,
  webTools: false,
  multiagent: false,
  allowPackageManagers: false,
  allowMcpServers: false,
  hosts: ALLOWED_HOSTS,
  customTools: TOOL_NAMES,
} as const

export type AgentFacts = {
  model: string; effort: string | null; geo: string | null; webFetch: boolean; webSearch: boolean; multiagent: boolean
  customTools: string[]
}
export type EnvironmentFacts = { networking: string; hosts: string[]; allowPackageManagers: boolean; allowMcpServers: boolean }

/** What differs between an agent (as a file or as the live version) and the policy; empty means it matches. */
export function agentDifferences(a: AgentFacts): string[] {
  const out: string[] = []
  if (a.model !== AGENT_POLICY.model) out.push('model')
  if (a.effort !== AGENT_POLICY.effort) out.push('effort')
  if (a.geo !== AGENT_POLICY.geo) out.push('inference_geo')
  if (a.webFetch || a.webSearch) out.push('web tools')
  if (a.multiagent) out.push('multiagent')
  if ([...a.customTools].sort().join() !== [...AGENT_POLICY.customTools].sort().join()) out.push('custom tools')
  return out
}

export function environmentDifferences(e: EnvironmentFacts): string[] {
  const out: string[] = []
  if (e.networking !== 'limited') out.push('networking')
  if ([...e.hosts].sort().join() !== [...ALLOWED_HOSTS].sort().join()) out.push('hosts')
  if (e.allowPackageManagers) out.push('allow_package_managers')
  if (e.allowMcpServers) out.push('allow_mcp_servers')
  return out
}
