'use client'

import dynamic from 'next/dynamic'

// The holdout island loads after the checkout has (speed review H1: checkout's first-load budget is 121 kB and EkCode
// adds nothing to it). Until it loads, nothing shows — the same as before the holdout is decided.
export const EkcodeIslandLazy = dynamic(() => import('./island').then((m) => m.EkcodeIsland), { ssr: false })
