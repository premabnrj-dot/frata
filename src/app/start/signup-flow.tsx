'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Wordmark } from '@/components/brand/wordmark'
import { FieldError, errorId, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { slugFor } from '@/domains/signup/slug'
import { ADDRESS_WORDS, addressUsable, signupSteps, stepForRefusal, stepNumber, type AddressState, type Moment, type Step } from '@/domains/signup/steps'
import { createMyShop } from './actions'
import { SellTiles } from './create-shop-form'
import { StorePreview } from './_components/store-preview'
import { useAddressCheck } from './_components/use-address-check'

// Loaded when opened or reached, so the name step's first load stays small (plan O1·8, speed).
const AddressDialog = dynamic(() => import('./_components/address-dialog').then((m) => m.AddressDialog))
const WhatsappStep = dynamic(() => import('./_components/whatsapp-step').then((m) => m.WhatsappStep))
const SignInFlow = dynamic(() => import('../login/sign-in-flow').then((m) => m.SignInFlow))

/** A plan card as the sign-up shows it (prices with GST from the server; never a cost). */
export type SignupPlan = { code: string; name: string; price: string; fee: string }

const TONE: Record<AddressState, 'ok' | 'warn' | 'neutral'> = { ok: 'ok', taken: 'warn', reserved: 'warn', shape: 'warn', too_short: 'neutral', limited: 'neutral' }
const MAKING_MS = 1300 // the store's own opening line (animate-going-live)

/**
 * Sign-up as drawn (mockup § 1; plan docs/plans/2026-11-23-o1-signup.md O1·8): the brand name first (its address made
 * from it and checked as it is typed), the plan, the WhatsApp code while it is on, what the store sells; the store draws
 * itself beside the questions (a strip above them on a phone). Nothing typed is lost on a refusal.
 */
export function SignupFlow({ shopDomain, plans, trialDays, codeOn, askEmail, hasStore = false, stuck }: {
  shopDomain: string; plans: SignupPlan[]; trialDays: number; codeOn: boolean
  /** Signed out: the email and code step after the name. */
  askEmail: boolean
  /** This person already owns a store: before any answer, they go to its console. */
  hasStore?: boolean
  /** "Stuck? WhatsApp us", kept under the form (plan Deviations). */
  stuck: React.ReactNode
}) {
  const router = useRouter()
  const toast = useToast()
  const steps = signupSteps({ askEmail, codeOn })
  const [moment, setMoment] = useState<Moment>('name')
  const [dir, setDir] = useState<'forward' | 'back'>('forward')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [popup, setPopup] = useState(false)
  const [popupLoaded, setPopupLoaded] = useState(false) // mounted once opened, so closing returns focus natively
  const [plan, setPlan] = useState(plans.some((p) => p.code === 'growth') ? 'growth' : plans[0]?.code ?? 'launch')
  const [codeId, setCodeId] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [sells, setSells] = useState<string[]>([])
  const [error, setError] = useState<{ field: string; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const changeRef = useRef<HTMLButtonElement>(null)
  useErrorSummary(error ? { [error.field]: error.text } : {}, { attempt, scope: root })
  const check = useAddressCheck(slug)

  const go = (to: Moment, d: 'forward' | 'back' = 'forward') => { setDir(d); setError(null); setMoment(to) }
  const next = (from: Step) => { const i = steps.indexOf(from); go(steps[i + 1] ?? 'making') }
  const back = () => { const i = steps.indexOf(moment as Step); if (i > 0) go(steps[i - 1]!, 'back') }
  // A step's first field takes focus when the step changes (never on the first paint).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const body = root.current?.querySelector<HTMLElement>('[data-step-body]')
    ;(body?.querySelector<HTMLElement>('input:not([disabled]), textarea') ?? body?.querySelector<HTMLElement>('h1'))?.focus({ preventScroll: true })
  }, [moment])

  // An owner arriving here goes to the console; one who just made a store stays on "ready to set up".
  const toConsole = hasStore && moment === 'name'
  useEffect(() => { if (toConsole) router.replace('/console') }, [toConsole, router])

  const nameOk = !!name.trim() && !!check && addressUsable(check.state)
  const fail = (field: string, text: string) => { setError({ field, text }); setAttempt((a) => a + 1) }

  async function create() {
    setDir('forward'); setError(null); setMoment('making')
    const started = Date.now() // clock-ok: in a handler
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let r: Awaited<ReturnType<typeof createMyShop>>
    try {
      r = await createMyShop({ name, slug, sells, plan, codeId: verified ? codeId : null, signupMs: null })
    } catch {
      setMoment('sells')
      toast.error('No connection. Try again.', { action: { label: 'Try again', run: () => { void create() } } })
      return
    }
    if (r.ok) {
      const left = (reduce ? 0 : MAKING_MS) - (Date.now() - started) // clock-ok: in a handler
      if (left > 0) await new Promise((done) => setTimeout(done, left))
      setMoment('done')
      return
    }
    if (r.hasShop) { toast.error(r.error); router.replace('/console'); return }
    const to = stepForRefusal(r.code)
    if (to === 'phone') { setCodeId(null); setVerified(false) }
    if (to) { setDir('back'); setMoment(to) } else setMoment('sells')
    if (r.field) fail(r.field, r.error)
    else toast.error(r.error, { action: { label: 'Try again', run: () => { void create() } } })
  }

  const anim = dir === 'forward' ? 'animate-step-forward' : 'animate-step-back'
  const n = stepNumber(steps, moment)
  const showBack = moment !== 'making' && moment !== 'done' && steps.indexOf(moment as Step) > 0

  if (toConsole) return null
  return (
    <div ref={root} className="su" data-step={moment}>
      <div id="su-q" tabIndex={-1} className="su-q outline-none">
        <div className="su-bar">
          <span className="su-wm"><Wordmark thread className="h-5" /></span>
          <div className="su-bar-end">
            <div className="su-dots" role="img" aria-label={`Step ${n} of ${steps.length}`}>
              {steps.map((s, i) => <i key={s} data-on={i < n ? '' : undefined} />)}
            </div>
            {askEmail ? <Link href="/login" className="su-link text-sm">Sign in</Link> : null}
          </div>
        </div>
        {showBack ? <button type="button" className="su-back" onClick={back}>Back</button> : <span aria-hidden="true" />}
        <div key={moment} data-step-body className={anim}>
          {moment === 'name' && (
            <form className="su-st" noValidate onSubmit={(e) => {
              e.preventDefault()
              if (!nameOk) return // the button waits while the name is empty or the address cannot be used (as drawn)
              next('name')
            }}>
              <h1 tabIndex={-1}>What is your brand called?</h1>
              <div className="su-f">
                <label htmlFor="name">Brand name</label>
                <input id="name" className="su-inp" autoFocus autoComplete="organization" maxLength={60} value={name}
                  aria-invalid={error?.field === 'name' || undefined} aria-describedby={error?.field === 'name' ? `su-addr ${errorId('name')}` : 'su-addr'}
                  onChange={(e) => { setName(e.target.value); setError(null); if (!slugEdited) setSlug(slugFor(e.target.value)) }} />
                <FieldError name="name" message={error?.field === 'name' ? error.text : null} className="text-sm" />
              </div>
              <div id="su-addr" className="su-addr" aria-live="polite">
                <code>{slug || 'your-brand'}.{shopDomain}</code>
                {check && ADDRESS_WORDS[check.state] ? <Badge tone={TONE[check.state]}>{ADDRESS_WORDS[check.state]}</Badge> : null}
                <button ref={changeRef} type="button" className="su-link" onClick={() => { setPopupLoaded(true); setPopup(true) }}>Change web address</button>
              </div>
              <FieldError name="slug" message={error?.field === 'slug' ? error.text : null} className="text-sm" />
              <button type="submit" className="su-go" disabled={!nameOk}>Use this name</button>
            </form>
          )}

          {/* Until O1·9 draws the email step: today's sign-in block in the question column. */}
          {moment === 'email' && <div className="su-st"><SignInFlow intent="start" /></div>}

          {moment === 'plan' && (
            <form className="su-st" noValidate onSubmit={(e) => { e.preventDefault(); next('plan') }}>
              <h1 tabIndex={-1}>Choose your plan</h1>
              <p className="su-sub">{trialDays} days free from going live</p>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Plan</legend>
                {plans.map((p) => (
                  <label key={p.code} className="su-radio">
                    <input type="radio" name="plan" value={p.code} checked={plan === p.code} onChange={() => setPlan(p.code)} />
                    <span><b className="font-medium">{p.name}</b><small><span className="font-mono">{p.price}</span>/mo + GST · {p.fee} per delivered order</small></span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="su-go">Continue</button>
            </form>
          )}

          {moment === 'phone' && (
            <WhatsappStep codeId={codeId} verified={verified} onCode={setCodeId} onVerified={() => setVerified(true)} onNext={() => next('phone')} />
          )}

          {moment === 'sells' && (
            <div className="su-st">
              <h1 tabIndex={-1}>What do you sell?</h1>
              <SellTiles sells={sells} onChange={setSells} />
              <button type="button" className="su-go" onClick={() => { void create() }}>Create store</button>
            </div>
          )}

          {moment === 'making' && <div className="su-st"><h1 tabIndex={-1}>Creating your store</h1></div>}

          {moment === 'done' && (
            <div className="su-st">
              <h1 tabIndex={-1}>{name.trim()} is ready to set up</h1>
              <Link href="/console" className="su-go">Set up store</Link>
            </div>
          )}
        </div>
        {moment !== 'making' && moment !== 'done' ? stuck : <span aria-hidden="true" />}
      </div>
      <StorePreview name={name} slug={slug} shopDomain={shopDomain} sell={sells[0] ?? null} />
      {popupLoaded && (
        <AddressDialog open={popup} current={slug} shopDomain={shopDomain}
          onKeep={() => { setPopup(false); requestAnimationFrame(() => changeRef.current?.focus()) }}
          onUse={(s) => { setSlug(s); setSlugEdited(true); setError(null); setPopup(false); requestAnimationFrame(() => changeRef.current?.focus()) }} />
      )}
    </div>
  )
}
