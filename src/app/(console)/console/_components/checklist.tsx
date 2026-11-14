import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import type { Setup } from '@/lib/queries/settings'
import { OpenShop } from './open-shop'

/** The setup checklist: Home before the shop opens, and /console/setup always (where the shop is closed again). */
export function Checklist({ setup, canManage }: { setup: Setup; canManage: boolean }) {
  const { steps, done } = setup
  return (
    <Section flush labelledBy="setup-h" className="max-w-3xl">
      <div className="space-y-2.5 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-h" className="text-section font-semibold">{setup.open ? 'Your shop’s setup' : 'Get your shop ready to sell'}</h2>
          <span className="text-sm text-muted-foreground"><span className="font-num">{done} of {steps.length}</span> done</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${done} of ${steps.length} steps done`}>
          <div className="h-full w-full origin-left bg-ok-text transition-transform duration-slow ease-standard" style={{ transform: `scaleX(${done / steps.length})` }} />
        </div>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 border-t border-border px-4 py-3">
            <Badge tone={s.done ? 'ok' : 'neutral'} className="mt-0.5 w-14 justify-center">{s.done ? 'Done' : 'To do'}</Badge>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.href && !s.done ? <Link href={s.href} className="underline-offset-2 hover:underline">{s.title}</Link> : s.title}</p>
              <p className="text-sm text-muted-foreground">{s.detail}</p>
              {s.key === 'publish' && <div className="mt-2"><OpenShop address={setup.address} open={s.done} ready={setup.ready} canManage={canManage} /></div>}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
