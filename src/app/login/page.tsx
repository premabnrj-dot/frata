import Link from 'next/link'
import { SignInFlow } from './sign-in-flow'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'

export const metadata = { title: 'Sign in · Frata' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams
  return (
    <main data-shell className={`flex min-h-dvh items-center justify-center p-4 ${SHELL_FONT_VARS}`}>
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border bg-card p-6">
        <div>
          <Link href="/" className="text-sm font-semibold text-brand">Frata</Link>
          <h1 className="mt-1 text-xl font-semibold">Sign in to your shop</h1>
        </div>
        <SignInFlow intent="signin" linkFailed={link === 'other-browser'} />
        <p className="text-sm text-muted-foreground">New to Frata? <Link href="/start" className="underline">Start your shop</Link></p>
      </div>
    </main>
  )
}
