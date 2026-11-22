'use client'

import { useState } from 'react'
import { Button, Spinner } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/icons/icon'
import { ICON_BUTTON } from '@/components/ui/panel-rail'
import { cn } from '@/lib/utils'
import { ASK, PROPOSALS, SUGGESTIONS, WORK } from './fixtures'

// The chat's feed and composer (mockup 2026-11-22 screen 1 `.feed`, `.composer`; the cards, work lines and words as
// approved 16 Nov: "Words for Content" with Apply, Not this and Apply all, and Stop while the agent works). Fixture
// data only: Apply marks a line Applied here and nothing is sent (WB·4 wires it). The card, the bubble and the
// suggestion chips are built here as the redraw draws them (its `.card` rests on e1; no chip primitive exists).

type Said = 'open' | 'applied' | 'skipped'

function Agent({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2 text-small text-muted-foreground">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-sm bg-foreground text-small font-semibold text-background">F</span>Frrata agent
      </div>
      {children}
    </div>
  )
}

export function ChatFeed() {
  const [said, setSaid] = useState<Said[]>(PROPOSALS.map(() => 'open'))
  const left = said.filter((s) => s === 'open').length
  const set = (i: number, to: Said) => setSaid((s) => s.map((x, j) => (j === i ? to : x)))
  return (
    <div className="grid content-start gap-3 overflow-auto p-3">
      <p className="max-w-[85%] justify-self-end rounded-lg rounded-br-xs bg-select px-3 py-2">{ASK}</p>
      <Agent>
        <ul className="grid gap-1 text-label text-muted-foreground">
          {WORK.map((w) => (
            <li key={w.t} className="flex items-center gap-2">
              {w.run ? <Spinner className="size-3" /> : <span aria-hidden="true" className="size-3 rounded-full border-[3px] border-ok bg-ok-mark" />}
              {w.t}
            </li>
          ))}
        </ul>
      </Agent>
      <Agent>
        <section aria-label="Words for Content" className="grid gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-label font-semibold">Words for Content</h3>
            <span className="text-small text-muted-foreground">{left ? `${left} to apply` : 'Done'}</span>
          </div>
          {PROPOSALS.map(([where, words], i) => (
            <div key={where} className="grid gap-1 border-t border-line-soft pt-2">
              <span className="text-small text-muted-foreground">{where}</span>
              <span>{words}</span>
              <span className="flex gap-1.5">
                {said[i] === 'applied' ? <Badge tone="ok">Applied</Badge>
                  : said[i] === 'skipped' ? <Badge tone="neutral">Not used</Badge>
                    : <><Button size="sm" variant="secondary" onClick={() => set(i, 'applied')}>Apply</Button><Button size="sm" variant="ghost" onClick={() => set(i, 'skipped')}>Not this</Button></>}
              </span>
            </div>
          ))}
          {left > 1 ? <div className="flex justify-end"><Button size="sm" onClick={() => setSaid((s) => s.map((x) => (x === 'open' ? 'applied' : x)))}>Apply all {left}</Button></div> : null}
        </section>
      </Agent>
    </div>
  )
}

/** The composer while the agent works: suggestions, the box (typing still works) and Stop. */
export function Composer({ working }: { working: boolean }) {
  return (
    <div className="grid gap-2 border-t border-line-soft px-3 py-2.5">
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => <button key={s} type="button" className="min-h-11 rounded-full border border-border bg-card px-2.5 text-small md:min-h-7">{s}</button>)}
      </div>
      <label className="flex items-center gap-1.5 rounded-md border border-input bg-card py-1 pr-1 pl-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-halo">
        <span className="sr-only">Ask for a change</span>
        <input className="min-h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3" placeholder={working ? 'Working · you can still type' : 'Ask for a change'} />
        <button type="button" aria-label={working ? 'Stop the agent' : 'Send message'} className={cn(ICON_BUTTON, working ? 'bg-foreground text-background hover:bg-foreground hover:text-background' : 'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground')}>
          {working ? <span aria-hidden="true" className="size-3 rounded-xs bg-current" /> : <Icon name="up" className="size-4" />}
        </button>
      </label>
    </div>
  )
}
