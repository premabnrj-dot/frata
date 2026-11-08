// =============================================================================
// FILE: src/lib/log.ts — what an error may say in a log (security review S10, 2026-11-08)
//
// A drizzle error carries its query AND its parameters, so logging the error
// itself (or its message) puts emails, phones and addresses in Vercel's logs.
// Log errName(err): the Postgres code and constraint when there is one, else
// the error's class name. `npm test` (check:logs) fails a console call handed
// a bare error.
// =============================================================================

export function errName(err: unknown): string {
  const c = (err as { cause?: { code?: unknown; constraint_name?: unknown } } | null)?.cause
  const code = typeof c?.code === 'string' ? c.code : typeof (err as { code?: unknown } | null)?.code === 'string' ? (err as { code: string }).code : ''
  const constraint = typeof c?.constraint_name === 'string' ? c.constraint_name : ''
  const name = err instanceof Error ? err.name : typeof err
  return [name, code, constraint].filter(Boolean).join(' ')
}
