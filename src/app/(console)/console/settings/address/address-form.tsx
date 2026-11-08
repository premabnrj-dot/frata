'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InfoTip } from '@/components/ui/info-tip'
import { slugProblem } from '@/domains/signup/slug'
import { RENAMES_AFTER_OPENING } from '@/domains/addresses/names'
import type { AddressCheck } from '@/app/start/actions'
import { changeAddress, checkShopAddress } from '../actions'
import { Section } from '@/components/layout/section'
import { PageHeader } from '@/components/layout/page-header'

const WORDS: Record<AddressCheck['state'], string> = { ok: 'Available', taken: 'Taken', too_short: 'At least 3 letters', shape: 'Letters, digits and hyphens only', reserved: 'Taken' }

/**
 * The shop's frrata.shop address (shop addresses D·1; spec § Words on screen: the address, its state, the limit, nothing
 * else). Free before the first opening (`left` null); two changes after it, confirmed in a dialog.
 */
export function AddressForm({ current: first, shopDomain, left: firstLeft, old: firstOld, frozen, support }: {
  current: string; shopDomain: string; left: number | null; old: string[]; frozen: boolean; support: boolean
}) {
  const router = useRouter()
  // What a rename changes is known at once: the screen updates itself, not only when the refresh lands.
  const [{ current, left, old }, setFacts] = useState({ current: first, left: firstLeft, old: firstOld })
  const [slug, setSlug] = useState(first)
  const [state, setState] = useState<AddressCheck | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const changed = slug !== current
  const locked = support || frozen || left === 0

  useEffect(() => {
    if (!changed) { setState(null); return }
    const p = slugProblem(slug)
    if (p) { setState({ state: p }); return }
    const t = setTimeout(() => { checkShopAddress(slug).then(setState) }, 300)
    return () => clearTimeout(t)
  }, [slug, changed])

  const change = () => start(async () => {
    const r = await changeAddress(slug)
    setConfirming(false)
    setMsg(r.ok ? { ok: true, text: `Moved to ${slug}.${shopDomain}` } : { ok: false, text: r.error })
    if (!r.ok) return
    setFacts((f) => ({
      current: slug,
      left: f.left === null ? null : Math.max(0, f.left - 1),
      old: f.left === null ? f.old.filter((n) => n !== slug) : [f.current, ...f.old.filter((n) => n !== slug)],
    }))
    router.refresh()
  })
  const line = frozen ? 'Address changes paused by Frrata'
    : state ? WORDS[state.state]
    : left === null ? null : left === 0 ? 'No changes left' : `${left} ${left === 1 ? 'change' : 'changes'} left`

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Shop address" back={{ href: '/console/settings', label: 'Settings' }} />
      <Section>
        <label htmlFor="slug" className="flex items-center gap-1 text-sm font-medium">Frrata address
          {left !== null && <InfoTip about="old addresses">Old addresses keep working.</InfoTip>}
        </label>
        <div className="flex items-center gap-1 rounded-md border border-input bg-card px-3 font-mono text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <input id="slug" value={slug} disabled={locked || pending} aria-describedby="slug-h"
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)); setMsg(null) }}
            className="h-10 min-w-0 flex-1 bg-transparent outline-none disabled:opacity-70 md:h-9" />
          <span className="text-muted-foreground">.{shopDomain}</span>
        </div>
        {line && <p id="slug-h" aria-live="polite" className={`text-sm ${state?.state === 'ok' ? 'text-ok-text' : state || frozen || left === 0 ? 'text-warn-text' : 'text-muted-foreground'}`}>{line}</p>}
        {!changed && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(`https://${current}.${shopDomain}`).then(() => setMsg({ ok: true, text: 'Copied' })).catch(() => {}) }}>Copy</Button>
            <a href={`https://${current}.${shopDomain}`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center rounded-md border border-input px-3 text-sm md:min-h-9">Open</a>
          </div>
        )}
        {old.length > 0 && <p className="text-sm text-muted-foreground">Old: <span className="font-mono">{old.map((n) => `${n}.${shopDomain}`).join(', ')}</span></p>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!changed || pending} onClick={() => setSlug(current)}>Keep {current}</Button>
            <Button type="button" disabled={!changed || state?.state !== 'ok' || pending}
              onClick={() => (left === null ? change() : setConfirming(true))}>{pending ? 'Changing…' : `Change to ${slug || '…'}`}</Button>
          </div>
        )}
      </Section>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={`Change to ${slug}.${shopDomain}?`}
        actions={<>
          <Button type="button" variant="secondary" data-autofocus onClick={() => setConfirming(false)}>Keep {current}</Button>
          <Button type="button" disabled={pending} onClick={change}>{pending ? 'Changing…' : `Change to ${slug}`}</Button>
        </>}>
        <p className="text-sm">{left !== null && `${RENAMES_AFTER_OPENING - left + 1} of ${RENAMES_AFTER_OPENING} changes`}</p>
      </Dialog>
    </div>
  )
}
