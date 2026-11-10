'use client'

import { lazy, Suspense, type ReactNode } from 'react'

// The holdout island in its own chunk, fetched after the checkout's first load (checkout's first-load budget is 121 kB;
// React.lazy, not next/dynamic, whose loader cost more than the island). Until it loads nothing shows, as before the
// holdout is decided.
const Island = lazy(() => import('./island').then((m) => ({ default: m.EkcodeIsland })))

export function EkcodeIslandLazy(p: { children: ReactNode; mark: ReactNode }) {
  return <Suspense fallback={null}><Island {...p} /></Suspense>
}
