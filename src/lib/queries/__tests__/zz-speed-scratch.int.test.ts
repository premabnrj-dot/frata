// TEMPORARY speed-review probe; deleted after the run.
import { it, vi } from 'vitest'
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: () => {} }))
const out = (...a: unknown[]) => require('fs').appendFileSync('/tmp/claude-0/-home-user-frata/799f3e31-37bb-55b0-a6a1-ad0b76bcefd0/scratchpad/probe.out', a.join(' ') + '\n')
it('product probe', async () => {
  process.env.DATABASE_URL = 'postgresql://frata_app:x@localhost:54339/frata_speed'
  const { shopProduct } = await import('@/lib/queries/storefront')
  const A = 'aaaaaaaa-0000-0000-0000-000000000001'
  await shopProduct(A, 'kurta-1') // warm the pool
  out('MARK-START')
  const t = performance.now()
  const r = await shopProduct(A, 'kurta-2')
  out('ms', (performance.now() - t).toFixed(1))
  const bytes = Buffer.byteLength(JSON.stringify(r))
  out('BYTES', bytes, r.kind === 'current' ? `pairs=${r.product.pairs.length} stories=${r.product.stories.length} offers=${r.product.offers?.length} pairOffers=${r.product.pairs.map((q) => q.offers?.length)}` : r.kind)
  const r1 = await shopProduct(A, 'kurta-1'); out('BYTES1', Buffer.byteLength(JSON.stringify(r1)))
}, 60000)
