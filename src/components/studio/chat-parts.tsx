import { Spinner } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The chat's parts (workbench mockup 2026-11-22 screen 1 `.feed`; states mockup 2026-11-22, approved 2026-11-23:
// `.me`, `.msg`/`.who`, `.prog`, `.stop`): the live chat's (the fixture page keeps its own, as screen 1 draws them). The agent's line wears its
// mark and name; a limit or a failure is a card with its edge in the state's colour, one title, one line, one action.

export function Agent({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2 text-small text-muted-foreground">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-sm bg-foreground text-small font-semibold text-background">F</span>Frrata agent
      </div>
      {children}
    </div>
  )
}

export function Person({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[85%] justify-self-end rounded-lg rounded-br-xs bg-select px-3 py-2 whitespace-pre-wrap">{children}</p>
}

/** What the agent did and is doing (state 3): done lines with their mark, the running one with a spinner. */
export function WorkLines({ lines }: { lines: readonly { words: string; done: boolean }[] }) {
  return (
    <ul className="grid gap-1 text-label text-muted-foreground">
      {lines.map((w, i) => (
        <li key={`${i}-${w.words}`} className="flex items-center gap-2">
          {w.done ? <span aria-hidden="true" className="size-2 rounded-full bg-ok-mark" /> : <Spinner className="size-3" />}
          {w.words}{w.done ? null : <span className="sr-only"> (working)</span>}
        </li>
      ))}
    </ul>
  )
}

/** A limit reached (warn, state 4) or a request that could not finish (bad, state 5). */
export function StopCard({ tone, title, line, action }: { tone: 'warn' | 'bad'; title: string; line: string; action?: React.ReactNode }) {
  return (
    // Said through the feed's polite region with the rest of the chat (never an alert: § Feedback).
    <div className={cn('grid gap-2 rounded-lg border bg-card px-3 py-2.5', tone === 'warn' ? 'border-warn-mark' : 'border-danger-mark')}>
      <b className="font-semibold">{title}</b>
      <span className="text-muted-foreground">{line}</span>
      {action ? <div className="flex gap-1.5">{action}</div> : null}
    </div>
  )
}
