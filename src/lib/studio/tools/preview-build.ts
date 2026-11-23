import 'server-only'
import { TOOL_ERRORS } from '@/domains/studio/tools'
import { standInHosting, type HostingPort } from '@/lib/studio/hosting'
import type { TurnContext } from '@/lib/studio/as-turn'
import { refused, type ToolOutcome } from './types'

/** `preview_build`: a preview of the session branch's head, which hosting reads itself. Until V2a: not available. */
export async function previewBuild(ctx: TurnContext, hosting: HostingPort = standInHosting): Promise<ToolOutcome> {
  // The request is a row in the turn's own bound write (an outbox row, ADR-0006), never a call from the tool.
  const r = await ctx.write((tx) => hosting.requestPreview(tx, ctx.turn))
  if (!r.ok) return refused(r.why === 'busy' ? 'A preview is already building. Try again when it is ready.' : TOOL_ERRORS.unavailable)
  return { answer: { building: true }, isError: false }
}
