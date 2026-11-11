'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { OfferAction } from '@/domains/modules/offer'
import type { ModuleKey } from '@/domains/modules/registry'
import { setInterestAction, setModuleAction } from '../actions'

/**
 * An app's ONE button, matching its state (Apps gallery; offerFor decides which): Turn on / Turn off (with a confirm),
 * Turn on <the app it needs> first, Ask Frrata to add, See Growth, Tell me when it's ready. No button that fails:
 * who may not act sees why instead. Plain pending state and a refresh after the write (frata-gotchas).
 */
export function AppAction({ k, name, action, canManage, askHref, block = false }: {
  k: ModuleKey; name: string; action: OfferAction; canManage: boolean; askHref: string; block?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const wide = block ? 'w-full' : ''
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setError(null)
    const r = await fn().catch(() => ({ ok: false, error: 'We could not change it. Nothing was changed.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'We could not change it. Nothing was changed.'); return false }
    setConfirmOff(false); router.refresh(); return true
  }
  const err = error ? <p role="alert" className="mt-2 text-sm text-danger-text">{error}</p> : null
  const owner = <p className="text-sm text-muted-foreground">Ask the shop’s owner to change this.</p>

  if (action.kind === 'interest') {
    return (
      <div>
        <Button variant={action.asked ? 'secondary' : 'primary'} className={wide} aria-pressed={action.asked} disabled={busy}
          onClick={() => run(() => setInterestAction({ module: k, on: !action.asked }))}>
          {action.asked ? 'We’ll tell you when it’s ready' : 'Tell me when it’s ready'}
        </Button>
        {err}
      </div>
    )
  }
  if (action.kind === 'needs') {
    return <Link href={`/console/apps/${action.module}`} prefetch={false} className={`${button()} ${wide}`}>Turn on {action.name} first</Link>
  }
  if (action.kind === 'ask') {
    return canManage ? <a href={askHref} target="_blank" rel="noopener" className={`${button()} ${wide}`}>{action.label}</a> : owner
  }
  if (action.kind === 'plans') {
    return canManage ? <Link href="/console/settings/billing" prefetch={false} className={`${button()} ${wide}`}>{action.label}</Link> : owner
  }
  if (!canManage) return <p className="text-sm text-muted-foreground">{action.on ? 'On' : 'Off'} · ask the shop’s owner to change it.</p>
  if (!action.on) {
    return <div><Button className={wide} disabled={busy} onClick={() => run(() => setModuleAction({ module: k, on: true }))}>Turn on {name}</Button>{err}</div>
  }
  return (
    <div>
      <Button variant="secondary" className={`${wide} after:hidden`} disabled={busy} onClick={() => { setError(null); setConfirmOff(true) }}>Turn off {name}</Button>
      {!confirmOff ? err : null}
      <Dialog open={confirmOff} onClose={() => setConfirmOff(false)} title={`Turn off ${name}?`}
        description={<ul className="list-disc space-y-1 pl-5"><li>{name} stops for your shop.</li><li>Anything it had queued is cancelled.</li><li>What it made stays. Turn it back on any time.</li></ul>}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setConfirmOff(false)}>Keep {name}</Button><Button variant="destructive" disabled={busy} onClick={() => run(() => setModuleAction({ module: k, on: false }))}>Turn off {name}</Button></>}>
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </Dialog>
    </div>
  )
}
