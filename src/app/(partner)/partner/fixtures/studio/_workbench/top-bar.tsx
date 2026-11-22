import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/icons/icon'
import { ICON_BUTTON } from '@/components/ui/panel-rail'
import { cn } from '@/lib/utils'
import { BUILDING, CLIENT, CREDITS, STEPS, STEP_NOW } from './fixtures'

// The top bar (mockup screen 1 `.top`): back to Clients, the client, the steps (derived from the chat in V3b; a
// fixture here), credits and the one primary. Steps not current are text 2, not the drawn text 3 (3.3:1 on the side
// colour fails WCAG 1.4.3; Deviations). On a phone only the current step shows, and no primary. The steps and the
// credits pill are drawn here as the mockup draws them (Steps and Tag look different: BUILT AS DRAWN).

export function TopBar({ phone }: { phone: boolean }) {
  return (
    <header className="flex min-w-0 items-center gap-2.5 border-b border-border bg-side px-3">
      <Link href="/partner" aria-label="Back to Clients" className={ICON_BUTTON}><Icon name="back" className="size-4" /></Link>
      <span className="truncate font-semibold">{CLIENT}</span>
      <ol aria-label="Progress" className="mx-auto flex min-w-0 items-center gap-1 overflow-hidden">
        {STEPS.map((s, i) => {
          const state = i < STEP_NOW ? 'done' : i === STEP_NOW ? 'now' : 'next'
          if (phone && state !== 'now') return null
          return (
            <li key={s} aria-current={state === 'now' ? 'step' : undefined}
              className={cn('flex items-center gap-1.5 text-label whitespace-nowrap', state === 'now' ? 'font-medium text-foreground' : 'text-muted-foreground',
                i > 0 && !phone && 'before:mr-1 before:h-px before:w-3.5 before:bg-edge')}>
              <span aria-hidden="true" className={cn('grid size-4.5 place-items-center rounded-full border-[1.5px] text-small font-semibold',
                state === 'done' ? 'border-ok-mark bg-ok-mark text-primary-foreground' : state === 'now' ? 'border-primary text-primary' : 'border-edge')}>
                {state === 'done' ? <Icon name="tick" className="size-3" /> : i + 1}
              </span>
              {s}{state === 'done' ? <span className="sr-only"> (done)</span> : null}
            </li>
          )
        })}
      </ol>
      <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-label whitespace-nowrap"><b className="font-num font-semibold">{CREDITS}</b> credits</span>
      {phone ? null : <Button size="sm">Publish {BUILDING}</Button>}
    </header>
  )
}
