'use client'

import { shopLink } from '@/domains/analytics/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { addCreatorCode } from '../actions'
import { FIELD } from '@/components/ui/field'

/** The creator's link (the one builder, shopLink); with no address yet, the code alone. */
const creatorLink = (address: string, code: string) => { try { return shopLink(`https://${address}`, '/', { code }) } catch { return `?code=${code}` } }

// CREATOR CODES (offers O·2): a creator's own code for this offer, with a link to share (the shop's address with ?code=),
// and what it brought (O·3: ranked by delivered orders, with its RTO and leak alert). Never listed at checkout. Owners and admins add them (it changes who gets a started offer).
export function OfferCodes({ id, address, creators, canAdd, publicCode }: {
  id: string; address: string; canAdd: boolean; publicCode: string | null
  creators: { id: string; label: string; code: string; uses: string; given: string; orders: string; delivered: string; rto: string; byLink: string; leak: string | null }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState(''), [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()
  const box = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [also, setAlso] = useState<string | undefined>(undefined)
  useErrorSummary(errors, { attempt, scope: box, sub: also })
  const field = `${FIELD} w-full`
  const add = () => start(async () => {
    const r = await addCreatorCode(id, label, code)
    if (!r.ok) {
      const fields = r.errors ?? {}
      const bad = Object.keys(fields).length > 0
      setAlso(bad ? r.error : undefined); setErrors(fields)
      if (bad) setAttempt((a) => a + 1); else toast.error(r.error)
      return
    }
    setLabel(''); setCode(''); setErrors({}); toast.ok('Added. Share its link.'); router.refresh()
  })
  return (
    <Section title="Codes">
      <p className="text-sm text-muted-foreground">{publicCode ? <>Everyone&apos;s code: <b className="font-mono">{publicCode}</b>. </> : <>This offer applies by itself: a creator code here changes no price, it only records who sent the shopper. </>}Creator codes are your creators&apos; own; each link fills the code for their followers.</p>
      {creators.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {creators.map((c) => (
            <li key={c.id} className="grid gap-0.5 py-2">
              <span className="flex flex-wrap items-center gap-2"><b>{c.label}</b><span className="rounded-sm bg-muted px-1.5 font-mono text-xs">{c.code}</span>{c.leak ? <Badge tone="warn">Leak?</Badge> : null}<span className="ml-auto text-muted-foreground">{c.uses} uses · {c.given} given</span></span>
              <span className="text-xs text-muted-foreground">Last 30 days: {c.orders} orders · {c.delivered} delivered · RTO {c.rto} · {c.byLink} by link</span>
              {c.leak ? <span className="rounded-md bg-warn px-2 py-1 text-xs text-warn-text">{c.leak}</span> : null}
              <span className="truncate font-mono text-xs text-muted-foreground">{creatorLink(address, c.code)}</span>
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <div ref={box} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1"><label htmlFor="c-label" className="block text-sm font-medium">Creator</label>
            <input id="c-label" value={label} maxLength={40} placeholder="Riya" {...fieldProps('c-label', errors.label)} onChange={(e) => { setLabel(e.target.value); setErrors(({ label: _gone, ...rest }) => rest) }} className={field} /><FieldError name="c-label" message={errors.label} /></div>
          <div className="space-y-1"><label htmlFor="c-code" className="block text-sm font-medium">Their code</label>
            <input id="c-code" value={code} maxLength={20} placeholder="RIYA10" {...fieldProps('c-code', errors.code)} onChange={(e) => { setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()); setErrors(({ code: _gone, ...rest }) => rest) }} className={`${field} font-mono`} /><FieldError name="c-code" message={errors.code} /></div>
          <Button variant="secondary" onClick={add} disabled={pending || !label || !code}>Add code</Button>
        </div>
      ) : null}
    </Section>
  )
}
