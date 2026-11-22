'use client'

import { useId, useState } from 'react'
import { Section } from '@/components/layout/section'
import { Icon } from '@/components/icons/icon'
import { STUDIO_ICONS } from '@/components/icons/studio-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ICON_BUTTON, PanelRail } from '@/components/ui/panel-rail'
import { ResizeEdge } from '@/components/ui/resize-edge'
import { TabPanel, Tabs } from '@/components/ui/tabs'

// The gallery's Panels row (Studio workbench WB·2): a rail as folded, one with a dot, a panel that folds to its rail and
// resizes by its edge, a panel on the right whose edge widens it leftward, line tabs, and the workbench's icon buttons. e2e/flows/81-neel.mjs holds the drawn values and the keys.
export default function PanelsDemo() {
  const [paneW, setPaneW] = useState(240)
  const [railed, setRailed] = useState(true)
  const [rightW, setRightW] = useState(200)
  const [tab, setTab] = useState<'design' | 'code' | 'checks'>('design')
  const base = useId()
  return (
    <Section title="Panels" id="g-panels">
      <div className="flex flex-wrap items-start gap-6">
        <PanelRail items={[{ icon: 'messages', label: 'Show chat', note: '1 new', expanded: false, onClick: () => {} }]} className="h-24 rounded-md border border-line-soft" />
        <PanelRail items={[
          { icon: STUDIO_ICONS.inspector, label: 'Show inspector', expanded: false, onClick: () => {} }, { icon: STUDIO_ICONS.brush, label: 'Design', onClick: () => {} },
          { icon: 'code', label: 'Code', onClick: () => {} }, { icon: 'tick', label: 'Checks', note: '1 to fix', onClick: () => {} }, { icon: STUDIO_ICONS.clock, label: 'Versions', onClick: () => {} },
        ]} className="rounded-md border border-line-soft" />
        <div className="flex h-40 min-w-0 flex-1 overflow-hidden rounded-md border border-line-soft">
          {railed
            ? <PanelRail items={[{ icon: 'messages', label: 'Show the panel', expanded: false, controls: 'g-pane', onClick: () => setRailed(false) }]} className="border-r border-border" />
            : <div id="g-pane" className="relative shrink-0 border-r border-border bg-card p-3 text-sm" style={{ width: paneW }}>
                <Button variant="link" aria-expanded="true" aria-controls="g-pane" onClick={() => setRailed(true)}>Hide the panel</Button>
                <ResizeEdge label="Resize the panel" controls="g-pane" value={paneW} min={160} max={360} grows="ArrowRight" onChange={setPaneW} />
              </div>}
          <div className="grid flex-1 place-items-center bg-sunk text-small text-muted-foreground"><span className="font-num">{railed ? 'Folded' : `${paneW} px`}</span></div>
          <div id="g-right" className="relative shrink-0 border-l border-border bg-card" style={{ width: rightW }}>
            <ResizeEdge label="Resize the right panel" controls="g-right" value={rightW} min={160} max={280} grows="ArrowLeft" onChange={setRightW} />
            <div className="border-b border-line-soft px-1.5">
              <Tabs base={base} label="Inspector" variant="line" value={tab} onChange={setTab}
                tabs={[{ id: 'design', label: 'Design' }, { id: 'code', label: 'Code' }, { id: 'checks', label: <>Checks <Badge tone="warn">1<span className="sr-only"> to fix</span></Badge></> }]} />
            </div>
            <div className="p-3 text-small">
              <TabPanel base={base} id="design" value={tab}>Home hero</TabPanel>
              <TabPanel base={base} id="code" value={tab}>components/hero.tsx</TabPanel>
              <TabPanel base={base} id="checks" value={tab}>Photo has no description.</TabPanel>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {(['focus', 'device', 'copy', 'external'] as const).map((n) => <button key={n} type="button" aria-label={`Icon ${n}`} className={ICON_BUTTON}><Icon name={n === 'external' ? n : STUDIO_ICONS[n]} className="size-4" /></button>)}
          <button type="button" aria-label="Preview only" aria-pressed="true" className={ICON_BUTTON}><Icon name={STUDIO_ICONS.focus} className="size-4" /></button>
        </div>
      </div>
    </Section>
  )
}
