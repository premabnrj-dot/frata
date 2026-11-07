import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { accessFor } from '@/lib/db/platform'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { frataWhatsappLink } from '@/lib/site'
import { SignInFlow } from '../login/sign-in-flow'
import { CreateShopForm } from './create-shop-form'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'

export const metadata = { title: 'Start your shop · Frata' }
export const dynamic = 'force-dynamic'

// Sign-up: an email (link and code) → a shop name → a pickup pincode → one
// optional question. Everything else is asked where it is used, and the side
// panel says so (frata-design-language § Phase 1).
export default async function StartPage() {
  const auth = await requireUser()
  if (auth.ok) {
    const access = await accessFor(auth.userId).catch(() => null)
    if (access?.memberships.some((m) => m.role === 'owner' && !m.supportSessionId)) redirect('/console')
  }
  return (
    <main data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-8">
        <Link href="/" className="text-base font-semibold text-brand">Frata</Link>
        {!auth.ok && <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>}
      </header>
      <div className="mx-auto grid max-w-4xl gap-10 px-4 py-10 sm:px-8 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="max-w-md">
          {auth.ok ? <CreateShopForm shopDomain={SHOP_DOMAIN} /> : (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight">Start your shop</h1>
              <SignInFlow intent="start" />
            </div>
          )}
        </div>
        <aside aria-label="Asked later" className="space-y-2 border-l-2 border-border pl-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Not asked now</p>
          <p>No password: you sign in with a link or a code we email.</p>
          <p>Your logo, GSTIN and full address: in Settings, before your first invoice.</p>
          <p>Razorpay and its KYC: only when you want UPI and card payments. Pay on delivery works without it.</p>
          <p>A plan: when you open your shop to shoppers.</p>
          <p className="pt-2">Stuck? <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="underline">Ask us on WhatsApp</a></p>
        </aside>
      </div>
    </main>
  )
}
