import 'server-only'
import type { Sweep } from '@/lib/db/platform'
import { errName } from '@/lib/log'

/**
 * One drain sweep, page by page (SA1b D·6): each page's shops are handled, then the next page after the last id, until
 * a page comes back short or the deadline passes (a fixed moment in the run, so the outbox keeps its time: architecture
 * review 9). The window stays fixed across pages. Past the deadline the rest wait for the next run, whose window
 * overlaps this one by a minute, and every cached copy still has its hour: logged, never silent.
 */
export async function pagedSweep(name: string, page: Sweep, since: Date, until: Date, deadline: number,
  each: (ids: string[]) => Promise<void>, clock: () => number = Date.now, size = 500): Promise<{ shops: number; done: boolean }> {
  let after: string | null = null, shops = 0
  for (;;) {
    if (clock() > deadline) { console.error(`[cron] drain ${name}: deadline, the rest next run (${shops} done)`); return { shops, done: false } }
    let ids: string[]
    try { ids = await page(since, until, after) } catch (e) { console.error(`[cron] drain ${name}`, errName(e)); return { shops, done: false } }
    if (ids.length) await each(ids)
    shops += ids.length
    if (ids.length < size) return { shops, done: true }
    after = ids[ids.length - 1]!
  }
}
