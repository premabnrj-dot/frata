import 'server-only'
import { TOOL_ERRORS } from '@/domains/studio/tools'
import { standInHosting, type HostingPort } from '@/lib/studio/hosting'
import type { TurnContext } from '@/lib/studio/as-turn'
import { refused, type ToolOutcome } from './types'

/** `preview_build`: a preview of the session branch's head, which hosting reads itself. Until V2a: not available. */
export async function previewBuild(ctx: TurnContext, hosting: HostingPort = standInHosting): Promise<ToolOutcome> {
  const r = await hosting.previewFor(ctx.turn)
  if (!r.ok) return refused(r.why === 'busy' ? 'A preview is already building. Try again when it is ready.' : TOOL_ERRORS.unavailable)
  return { answer: { building: true }, isError: false }
}
