import { requireUser } from '@/lib/auth/require-user'
import { publicPlans, signupTrialDays } from '@/lib/db/platform'
import { accessOf } from '@/lib/auth/session'
import { formatInr, formatPercent } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { frataWhatsappLink } from '@/lib/site'
import { SignupFlow } from './signup-flow'
import { signupCodeOn } from '@/lib/trials/signup-code'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { SELL_TILES } from '@/domains/catalogue/packs'
import './signup.css'

export const metadata = { title: 'Start your store' }
export const dynamic = 'force-dynamic'

// Sign-up (plan docs/plans/2026-11-23-o1-signup.md, mockup § 1): the brand name first, then email and code (skipped when
// signed in), the plan, the WhatsApp code while it is on, what the store sells. The store draws itself beside the
// questions. Everything else is asked where it is used (the pickup PIN code in Settings › Store).
export default async function StartPage() {
  const auth = await requireUser()
  // An owner goes to their console. Said to the flow, not redirected here: creating the store re-renders this page while
  // the "ready to set up" screen shows, and a redirect would take that screen away (owner call 7 keeps its one tap).
  const owner = auth.ok && !!(await accessOf(auth.userId).catch(() => null))?.memberships.some((m) => m.role === 'owner' && !m.supportSessionId)
  // Trials TR1: the plans and the trial length, read from the price list and Admin's setting (never a copy). Read for
  // everyone (they are public), so the steps never recount after the email step.
  const [planRows, trialDays] = await Promise.all([publicPlans(), signupTrialDays()])
  const plans = planRows.map((p) => ({ code: p.code, name: p.name, price: formatInr(paise(p.monthlyPrice)),
    fee: formatPercent(p.feeBps / 10_000, p.feeBps % 100 === 0 ? 0 : 1) }))
  return (
    <main id="content" tabIndex={-1} data-shell data-signup className={`outline-none ${SHELL_FONT_VARS}`}>
      <a href="#su-q" className="sr-only text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink-foreground focus:px-3 focus:py-2">Skip to content</a>
      <SignupFlow shopDomain={SHOP_DOMAIN} plans={plans} trialDays={trialDays} codeOn={signupCodeOn()} askEmail={!auth.ok} hasStore={owner} tiles={SELL_TILES}
        stuck={<p className="su-stuck">Stuck? <a href={frataWhatsappLink()} target="_blank" rel="noopener">WhatsApp us</a></p>} />
    </main>
  )
}
