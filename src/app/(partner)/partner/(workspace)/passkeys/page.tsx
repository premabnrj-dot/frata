import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { requirePartner } from '@/lib/auth/require-partner'
import { myPasskeys } from '@/lib/db/partner-passkeys'
import { dayIN } from '@/lib/format-date'
import { AddPasskey, DeleteOne } from './passkey-parts'

export const metadata = { title: 'Passkeys' }

/** Passkeys (T1b; partner sign-in mockup screen 18): your own, named by their password manager; one only → add a backup. */
export default async function PasskeysPage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const keys = await myPasskeys(auth).catch((err) => { console.error('[passkeys]', err instanceof Error ? err.name : err); return null })
  if (!keys) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const now = new Date()
  const used = (at: string | null) => {
    if (!at) return 'not used yet'
    const days = Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
    return days < 1 ? 'used today' : days === 1 ? 'used yesterday' : `used ${days} days ago`
  }
  return (
    <>
      <PageHeader title="Passkeys" actions={<AddPasskey />} />
      {keys.length === 0 ? <Panel title="No passkeys yet" action={<AddPasskey />} /> : (
      <Section flush className="max-w-xl" ariaLabel="Your passkeys"><ul data-list className="divide-y divide-border">
        {keys.map((k) => (
          <li key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{k.name}</p>
              <p className="text-small text-muted-foreground">Added <span className="font-num">{dayIN(new Date(k.createdAt))}</span> · {used(k.lastUsedAt)}</p>
            </div>
            {k.inUse ? <Badge tone="info">This device</Badge>
              : <DeleteOne id={k.id} name={k.name} />}
          </li>
        ))}
      </ul></Section>
      )}
      {keys.length === 1 && (
        <Banner tone="warn" className="mt-3 max-w-xl" title="Add a backup passkey on another device" action={<AddPasskey label="Add passkey" />} />
      )}
    </>
  )
}
