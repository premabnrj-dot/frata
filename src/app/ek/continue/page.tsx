import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { currentShop } from '@/lib/ekcode/signin'
import { scheme } from '@/lib/ekcode/cookie-name'
import { AGE_LINE, NOTICE_LINES } from '@/domains/ekcode-core/notice'
import { Continue } from '@/components/ekcode/continue'

// /continue: the shop the shopper came from (from the sealed cookie's flow, never the URL) and the sign-in island.
// Per request (no-store, a nonce CSP from the middleware).
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Continue', robots: { index: false, follow: false } }

export default async function ContinuePage() {
  await cookies()
  const view = await currentShop()
  if (!view) {
    return (
      <section className="grid gap-3 pt-4">
        <h1 className="text-xl font-semibold">This sign-in has expired</h1>
        <p className="text-sm text-[var(--ek-sub)]">Go back to the shop and tap Continue with EkCode again.</p>
      </section>
    )
  }
  return <Continue shop={view.name} back={`${scheme()}://${view.host}/checkout`} notice={[...NOTICE_LINES]} age={AGE_LINE} />
}
