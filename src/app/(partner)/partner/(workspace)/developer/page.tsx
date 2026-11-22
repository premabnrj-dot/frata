import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { Tag } from '@/components/ui/badge'
import { requirePartner } from '@/lib/auth/require-partner'
import { myComputers } from '@/lib/db/device-codes'
import { momentIN } from '@/lib/format-date'
import { endsInWords } from '@/domains/storefront-api/device'
import { errName } from '@/lib/log'
import { DeleteComputer, SignInComputer } from './developer-parts'

export const metadata = { title: 'Developer' }

/**
 * Partner workspace › Developer (G·3; four screens § 2, owner-approved 2026-11-22). Sign in this computer: the person
 * at the terminal types the code it shows and gives that computer a Build key with a passkey made for it. Your
 * computers: their own developer keys, each deleted at once. A Builder sees the one line the States table gives them.
 */
export default async function DeveloperPage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  if (auth.partner.memberRole === 'builder') {
    return <><PageHeader title="Developer" /><Panel title="Only a Partner owner or a Lead can sign in a computer." /></>
  }
  const computers = await myComputers({ userId: auth.userId, sessionId: auth.sessionId, stepup: auth.stepup })
    .catch((err) => { console.error('[developer]', errName(err)); return null })
  const now = new Date()
  return (
    <>
      <PageHeader title="Developer" />
      <div className="grid max-w-xl gap-4">
        <Section title="Sign in this computer"><SignInComputer /></Section>
        <Section title="Your computers" flush>
          {computers === null ? <p className="px-4 py-3 text-sm text-muted-foreground">We couldn’t load your computers. Try again in a minute.</p>
            : computers.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No computers signed in</p> : (
            <ul data-list className="divide-y divide-border">
              {computers.map((c) => (
                <li key={c.id} className="grid gap-1.5 px-4 py-3 text-sm">
                  <p className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{c.store}</span><Tag>Build</Tag></p>
                  {/* As drawn: Delete key on the second line, after when it was confirmed and when it ends. */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
                    <p className="text-small text-muted-foreground">
                      Confirmed <time dateTime={c.createdAt} className="font-num">{momentIN(c.createdAt, now)}</time> · {endsInWords(new Date(c.expiresAt), now)}
                    </p>
                    <DeleteComputer id={c.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
