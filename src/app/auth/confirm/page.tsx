import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { Selvedge, SiteHeader, SiteStage } from '@/components/brand/site'
import { Submit } from '@/components/ui/submit'
import { confirmLinkAction } from './actions'

export const metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

/**
 * The sign-in email's button lands here (partner sign-in mockup screen 4): it never signs in by itself; "Sign in" does.
 * Shared by every sign-in (the email is one template), so it wears the public frame, not the partner tag.
 */
export default async function ConfirmLinkPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash = '', type = 'magiclink' } = await searchParams
  return (
    <div data-shell className={`flex min-h-dvh flex-col bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[]} /></SiteStage>
      <Selvedge />
      <main id="content" tabIndex={-1} className="flex flex-1 items-start justify-center p-4 pt-12 outline-none">
        <form action={confirmLinkAction} className="grid w-full max-w-sm gap-4 rounded-md border border-border bg-card p-6">
          <input type="hidden" name="token" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <h1 className="font-display text-title font-semibold">Sign in on this device?</h1>
          <Submit size="lg">Sign in</Submit>
          <p className="text-sm text-muted-foreground">Started on another device? Type the code there.</p>
        </form>
      </main>
    </div>
  )
}
