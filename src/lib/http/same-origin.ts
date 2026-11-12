import { surfaceFor } from '@/domains/tenancy/host'
import { CONSOLE_HOST, EKCODE_HOST } from '@/lib/public-env'

// =============================================================================
// FILE: src/lib/http/same-origin.ts
//
// A COOKIE-AUTHENTICATED POST ROUTE CHECKS ITS ORIGIN ITSELF (frata-architecture § Auth: Next checks Origin for server
// actions only). A console route answers only a request whose Origin is the very host it was sent to (host and port),
// and that host serves the console (surfaceFor: the console host, a vercel.app alias, or localhost in the e2e stack).
// A missing or unreadable Origin is refused; browsers send Origin on every POST, same-origin included.
// =============================================================================

export function fromConsole(request: Request, consoleHost = CONSOLE_HOST): boolean {
  const origin = request.headers.get('origin'), host = (request.headers.get('host') ?? '').toLowerCase()
  if (!origin || !host) return false
  let from: string
  try { from = new URL(origin).host.toLowerCase() } catch { return false }
  const surface = surfaceFor(host, consoleHost, EKCODE_HOST).kind
  return from === host && (surface === 'console' || surface === 'local')
}
