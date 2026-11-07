'use client'

import { Info } from 'lucide-react'
import { useId, useRef } from 'react'
import { placeUnder } from './anchor'

// =============================================================================
// FILE: src/components/ui/info-tip.tsx
//
// THE (i) INFO TIP (frata-design-language § Labels, info tips and help text):
// optional detail only — a definition, why we ask, what happens later. Never an
// error, a limit the person must meet, money, legal wording or a risk reason:
// those stay visible. Tap or click to open (phones have no hover), Esc, a tap
// outside or a second tap closes (native popover), focus stays on the button.
// One or two sentences, at most 288 px wide.
// =============================================================================

export function InfoTip({ about, children }: { about: string; children: React.ReactNode }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={button} type="button" popoverTarget={id} aria-label={`About ${about}`} aria-expanded={false} aria-controls={id}
        // A 24 px target around a 14 px mark (rule 19), padded rather than a bigger icon.
        className="inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-muted-foreground hover:text-foreground">
        <Info aria-hidden className="size-3.5" />
      </button>
      {/* A span, not a div: a tip sits inside labels and paragraphs, where a div would end the paragraph and break hydration (found by e2e, 2026-11-07). */}
      <span id={id} popover="auto" data-pop="tip" role="note"
        // Said before it shows (beforetoggle is synchronous), so a screen reader never hears a stale state.
        onBeforeToggle={(e) => button.current?.setAttribute('aria-expanded', String((e as unknown as ToggleEvent).newState === 'open'))}
        onToggle={(e) => { if ((e as unknown as ToggleEvent).newState === 'open' && button.current) placeUnder(button.current, e.currentTarget) }}
        className="max-w-72 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground">
        {children}
      </span>
    </>
  )
}
