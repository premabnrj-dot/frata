import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { publicPlans, signupTrialDays } from '@/lib/db/platform'
import { accessOf } from '@/lib/auth/session'
import { formatInr, formatPercent } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { frataWhatsappLink } from '@/lib/site'
import { SignInFlow } from '../login/sign-in-flow'
import { CreateShopForm } from './create-shop-form'
import { signupCodeOn } from '@/lib/trials/signup-code'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { Selvedge, SiteHeader, SiteStage } from '@/components/brand/site'

export const metadata = { title: 'Start your shop' }
export const dynamic = 'force-dynamic'

// Sign-up: an email (link and code) → a shop name → a pickup pincode → one
// optional question. Everything else is asked where it is used, and the side
// panel says so (frata-design-language § Phase 1).
export default async function StartPage() {
  const auth = await requireUser()
  if (auth.ok) {
    const access = await accessOf(auth.userId).catch(() => null)
    if (access?.memberships.some((m) => m.role === 'owner' && !m.supportSessionId)) redirect('/console')
  }
  // Trials TR1: the plans and the trial length, read from the price list and Admin's setting (never a copy).
  const [planRows, trialDays] = auth.ok ? await Promise.all([publicPlans(), signupTrialDays()]) : [[], 30]
  const plans = planRows.map((p) => ({ code: p.code, name: p.name, price: formatInr(paise(p.monthlyPrice)),
    included: p.includedOrders.toLocaleString('en-IN'), fee: formatPercent(p.feeBps / 10_000, p.feeBps % 100 === 0 ? 0 : 1) }))
  return (
    <div data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[]} action={auth.ok ? undefined : { href: '/login', label: 'Sign in' }} /></SiteStage>
      <Selvedge />
      <main id="content" tabIndex={-1} className="mx-auto grid max-w-4xl gap-10 px-4 py-10 outline-none sm:px-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-md">
          {auth.ok ? <CreateShopForm shopDomain={SHOP_DOMAIN} plans={plans} trialDays={trialDays} codeOn={signupCodeOn()} /> : (
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Start your shop</h1>
              <SignInFlow intent="start" />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground md:pt-1">Stuck? <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="underline">WhatsApp us</a></p>
      </main>
    </div>
  )
}
