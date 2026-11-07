'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { slugProblem } from '@/domains/signup/slug'
import { frataWhatsappLink } from '@/lib/site'
import { checkAddress, type AddressCheck } from '@/app/start/actions'
import { changeAddress } from '../actions'
import { Section } from '@/components/layout/section'
import { PageHeader } from '@/components/layout/page-header'

const WORDS: Record<AddressCheck['state'], string> = { ok: 'Available', taken: 'Taken. Try another.', too_short: 'At least 3 letters', shape: 'Letters, digits and hyphens only', reserved: 'Reserved. Try another.' }

/** The shop's address: free to change until the shop opens; after that Frrata support moves it. */
export function AddressForm({ current, shopDomain, published, support }: { current: string; shopDomain: string; published: boolean; support: boolean }) {
  const router = useRouter()
  const [slug, setSlug] = useState(current)
  const [state, setState] = useState<AddressCheck | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const changed = slug !== current

  useEffect(() => {
    if (!changed) { setState(null); return }
    const p = slugProblem(slug)
    if (p) { setState({ state: p }); return }
    const t = setTimeout(() => { checkAddress(slug).then(setState) }, 300)
    return () => clearTimeout(t)
  }, [slug, changed])

  const locked = published || support
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title={'Shop address'} back={{ href: '/console/settings', label: 'Settings' }} />
      <p className="text-sm text-muted-foreground">Where shoppers find you. Share it in your Instagram bio.</p>
      <Section>
        <label htmlFor="slug" className="block text-sm font-medium">Address</label>
        <div className="flex items-center gap-1 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <input id="slug" value={slug} disabled={locked || pending} aria-describedby="slug-h"
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)); setMsg(null) }}
            className="min-w-0 flex-1 bg-transparent outline-none disabled:opacity-70" />
          <span className="text-muted-foreground">.{shopDomain}</span>
        </div>
        <p id="slug-h" aria-live="polite" className={`text-sm ${state?.state === 'ok' ? 'text-ok-text' : state ? 'text-warn-text' : 'text-muted-foreground'}`}>
          {locked ? (support ? 'Only the shop’s owner can change its address.' : <>Your shop is open, so its address is fixed: links you shared keep working. <a href={frataWhatsappLink('Hi Frrata, I would like to change my shop’s address.')} target="_blank" rel="noopener" className="underline">Ask us on WhatsApp</a> to move it.</>)
            : state ? WORDS[state.state] : 'Free to change until your shop opens.'}
        </p>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
        {!locked && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!changed || pending} onClick={() => setSlug(current)}>Keep {current}</Button>
            <Button type="button" disabled={!changed || state?.state !== 'ok' || pending} onClick={() => start(async () => {
              const r = await changeAddress(slug)
              setMsg(r.ok ? { ok: true, text: `Your shop is now at ${slug}.${shopDomain}.` } : { ok: false, text: r.error })
              if (r.ok) router.refresh()
            })}>{pending ? 'Changing…' : `Move to ${slug || '…'}.${shopDomain}`}</Button>
          </div>
        )}
      </Section>
    </div>
  )
}
