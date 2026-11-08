import Link from 'next/link'
import { SignInFlow } from './sign-in-flow'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { Selvedge, SiteHeader, SiteStage } from '@/components/brand/site'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams
  return (
    <div data-shell className={`flex min-h-dvh flex-col bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[]} action={{ href: '/start', label: 'Start free' }} /></SiteStage>
      <Selvedge />
      <main id="content" tabIndex={-1} className="flex flex-1 items-start justify-center p-4 pt-12 outline-none">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border bg-card p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Sign in to your shop</h1>
        <SignInFlow intent="signin" linkFailed={link === 'other-browser'} />
        <p className="text-sm text-muted-foreground">New to Frrata? <Link href="/start" className="underline">Start your shop</Link></p>
      </div>
      </main>
    </div>
  )
}
