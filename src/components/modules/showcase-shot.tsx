import { Badge } from '@/components/ui/badge'
import type { Shot } from '@/domains/modules/showcase'

/**
 * A feature's picture on an app's page (Apps gallery): drawn from data in the console's own style, 16:10, never a
 * screenshot and never a real shopper (approved mockup 2026-11-11). Decorative beside its words: aria-hidden.
 */
export function ShowcaseShot({ shot }: { shot: Shot }) {
  return (
    <div aria-hidden="true" className="flex aspect-[16/10] w-full max-w-full flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 text-xs">
      {shot.kind === 'chat' ? (
        <>
          {shot.lines.map((l, i) => (
            <p key={i} className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${l.from === 'shop' ? 'self-start rounded-bl-sm bg-ok text-foreground' : 'self-end rounded-br-sm bg-muted'}`}>{l.text}</p>
          ))}
          {shot.foot ? <p className="mt-auto flex items-center justify-between gap-2 text-muted-foreground"><span>{shot.foot.text}</span><Badge tone="ok">{shot.foot.chip}</Badge></p> : null}
        </>
      ) : shot.kind === 'rows' ? (
        <>
          <p className="font-semibold">{shot.title}</p>
          <ul className="divide-y divide-border">
            {shot.rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{r.text}</span>
                {r.chip ? <Badge tone={r.tone ?? 'neutral'}>{r.chip}</Badge> : null}
              </li>
            ))}
          </ul>
          <span className="mt-auto h-1.5 w-2/5 rounded bg-muted" />
        </>
      ) : (
        <>
          <dl className="grid flex-1 grid-cols-2 gap-2">
            {shot.items.map((s) => (
              <div key={s.label} className="rounded-md bg-muted p-2">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="font-mono text-lg font-medium tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
          {shot.note ? <p><Badge tone="ok">{shot.note}</Badge></p> : null}
        </>
      )}
    </div>
  )
}
