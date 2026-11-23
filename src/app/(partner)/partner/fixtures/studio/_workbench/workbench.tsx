'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/empty'
import { WorkbenchShell } from '@/components/studio/shell'
import { TopBar } from './top-bar'
import { ChatFeed, Composer } from './chat'
import { DesignTab } from './design-tab'
import { BUILDING, NO_FLAGS, TO_FIX, type Part, type ShellFlags } from './fixtures'
import { Preview } from './preview'

// =============================================================================
// THE STUDIO WORKBENCH ON FIXTURE DATA (plan WB·3, WB·7; mockup docs/mockups/2026-11-22-studio-workbench.html screen 1):
// the shared shell (src/components/studio/shell.tsx, also the live screen's) with this page's fixture parts in its
// slots. Fixture data: ./fixtures.ts.
// =============================================================================

const CodeTab = dynamic(() => import('./code-tab'), { loading: () => <Skeleton /> })
const ChecksTab = dynamic(() => import('./checks-tab'), { loading: () => <Skeleton /> })
const VersionsTab = dynamic(() => import('./versions-tab'), { loading: () => <Skeleton /> })

export function Workbench({ flags = NO_FLAGS }: { flags?: ShellFlags }) {
  const [picked, setPicked] = useState<Part>('hero')
  return (
    <WorkbenchShell slots={{
      firstWords: `Building ${BUILDING} · about 1–2 min`,
      top: ({ phone }) => <TopBar phone={phone} />,
      chat: { railNote: '1 new', feed: () => <ChatFeed />, composer: () => <Composer working /> },
      preview: ({ phone, previewOnly, togglePreviewOnly, show }) => (
        <Preview phone={phone} previewOnly={previewOnly} onPreviewOnly={togglePreviewOnly} picked={picked} onPick={(p) => { setPicked(p); show('design', true) }} />
      ),
      inspector: {
        toFix: TO_FIX,
        design: () => <DesignTab key={picked} picked={picked} flags={flags} />,
        code: ({ say }) => <CodeTab say={say} />,
        checks: () => <ChecksTab />,
        versions: () => <VersionsTab />,
      },
    }} />
  )
}
