import { Panel } from '@/components/ui/panel'

/**
 * What an Analytics page says when its read fails: a read stopped at its time limit (Postgres 57014, the 3 s
 * statement_timeout, as on a cold cache) is "still counting", never an error; anything else is the console's error
 * panel. Logs the error's name only.
 */
export function readFailed(tag: string, err: unknown): { failed: React.ReactNode } {
  const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : null
  console.error(tag, err instanceof Error ? err.name : 'error', code === '57014' ? 'timeout' : '')
  if (code === '57014') return { failed: <Panel title="Still counting">This period has many orders to add up. Reload in a moment.</Panel> }
  return { failed: <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel> }
}
