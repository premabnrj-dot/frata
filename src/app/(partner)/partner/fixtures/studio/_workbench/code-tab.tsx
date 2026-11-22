'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { Icon } from '@/components/icons/icon'
import { STUDIO_ICONS } from '@/components/icons/studio-icons'
import { ICON_BUTTON } from '@/components/ui/panel-rail'
import { cn } from '@/lib/utils'
import { BRANCH, BUILDING, DEV_COMMAND, DIFF, FILES } from './fixtures'

// Code (mockup screen 1, `data-panel="code"`), loaded with next/dynamic on first open: the files changed in this
// version, its changes as plain lines (no diff or highlight library), the command to work on a computer, and a
// developer's branch. Read here, written elsewhere (spec § 1, call 8). Fixture only (WB·6 reads the session). The copy
// row is built here, not CopyField: as drawn, an icon button, and "Copied" goes to the workbench's one polite region
// (CopyField brings a text button and a second live region).

const LINE = { file: 'text-text-3', cut: 'text-code-cut', add: 'text-code-add', same: '' } as const

export default function CodeTab({ say }: { say: (words: string) => void }) {
  const [file, setFile] = useState('hero.tsx')
  const [show, setShow] = useState<'changes' | 'file'>('changes')
  const copy = async () => {
    try { await navigator.clipboard.writeText(DEV_COMMAND); say('Copied') } catch { say('Copy did not work. Select the command and copy it.') }
  }
  return (
    <div className="grid content-start gap-3.5">
      <ul aria-label="Files" className="grid text-label">
        {FILES.map((f) => (
          <li key={f.path}>
            {f.dir
              ? <span className="flex items-center gap-2 px-2 py-1 text-muted-foreground"><Icon name="collections" className="size-4" />{f.path}</span>
              : <button type="button" aria-current={file === f.path} onClick={() => setFile(f.path)}
                  className={cn('flex min-h-11 w-full items-center gap-2 rounded-sm py-1 pr-2 pl-6.5 text-left md:min-h-6', file === f.path ? 'bg-select text-foreground' : 'text-muted-foreground')}>
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>{f.changed ? <Tag>changed</Tag> : null}
                </button>}
          </li>
        ))}
      </ul>
      <Segmented label="Show" value={show} onPick={setShow} options={[['changes', `Changes in ${BUILDING}`], ['file', 'File']] as const} />
      <pre className="overflow-x-auto rounded-md bg-foreground px-3 py-2.5 font-mono text-small text-background">
        {DIFF.map((l) => <span key={l.text} className={cn('block', LINE[l.kind])}>{l.text}</span>)}
      </pre>
      <p className="text-small font-medium text-muted-foreground">Work on your computer</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-sunk py-1 pr-1 pl-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-small">{DEV_COMMAND}</code>
        <button type="button" aria-label="Copy command" onClick={copy} className={ICON_BUTTON}><Icon name={STUDIO_ICONS.copy} className="size-4" /></button>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-2.5">
        <span className="font-mono text-small">{BRANCH.name} · {BRANCH.changes} changes</span>
        <Button size="sm" variant="secondary">Hand branch to the agent</Button>
      </div>
    </div>
  )
}
