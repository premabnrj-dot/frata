import { ingest } from '@/lib/analytics/ingest'

// The visit beacon's ingest (A·2): src/lib/analytics/ingest.ts does the work. Skipped by the middleware (its matcher),
// so one beacon is one invocation. 204 at once; the insert in after() gives up within the analytics role's 2 s.
export const maxDuration = 10

export const POST = (request: Request) => ingest(request)
