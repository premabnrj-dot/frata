'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/unsaved'
import { addCreatorCode } from '../actions'

// CREATOR CODES (offers O·2): a creator's own code for this offer, with a link to share (the shop's address with ?code=),
// and what it brought. Never listed at checkout. Owners and admins add them (it changes who gets a started offer).
export function OfferCodes({ id, address, creators, canAdd, publicCode }: {
  id: string; address: string; canAdd: boolean; publicCode: string | null
  creators: { id: string; label: string; code: string; uses: string; given: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState(''), [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const field = 'h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'
  const add = () => start(async () => {
    const r = await addCreatorCode(id, label, code)
    if (!r.ok) { setErrors(r.errors ?? {}); setMsg({ tone: 'error', text: r.error }); return }
    setLabel(''); setCode(''); setErrors({}); setMsg({ tone: 'ok', text: 'Added. Share its link.' }); router.refresh()
  })
  return (
    <Section title="Codes">
      <p className="text-sm text-muted-foreground">{publicCode ? <>Everyone&apos;s code: <b className="font-mono">{publicCode}</b>. </> : <>This offer applies by itself: a creator code here changes no price, it only records who sent the shopper. </>}Creator codes are your creators&apos; own; each link fills the code for their followers.</p>
      {creators.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {creators.map((c) => (
            <li key={c.id} className="grid gap-0.5 py-2">
              <span className="flex flex-wrap items-center gap-2"><b>{c.label}</b><span className="rounded-sm bg-muted px-1.5 font-mono text-xs">{c.code}</span><span className="ml-auto text-muted-foreground">{c.uses} uses · {c.given} given</span></span>
              <span className="truncate font-mono text-xs text-muted-foreground">https://{address}/?code={c.code}</span>
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1"><label htmlFor="c-label" className="block text-sm font-medium">Creator</label>
            <input id="c-label" value={label} maxLength={40} placeholder="Riya" aria-invalid={!!errors.label || undefined} onChange={(e) => setLabel(e.target.value)} className={field} /></div>
          <div className="space-y-1"><label htmlFor="c-code" className="block text-sm font-medium">Their code</label>
            <input id="c-code" value={code} maxLength={20} placeholder="RIYA10" aria-invalid={!!errors.code || undefined} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className={`${field} font-mono`} /></div>
          <Button variant="secondary" onClick={add} disabled={pending || !label || !code}>Add code</Button>
        </div>
      ) : null}
      <Message m={msg} />
    </Section>
  )
}
