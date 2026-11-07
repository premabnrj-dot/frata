import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { isPaymentsConfigured } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'
import { paymentStatusFor } from '@/lib/queries/payments'
import { OnlinePayments } from './online-payments'

export const metadata = { title: 'Online payments · Frata' }

/** Settings → Online payments: the merchant's own Razorpay account. Owner only (it moves their money). */
export default async function OnlinePaymentsPage() {
  const auth = await requireMember(['owner'])
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the shop’s owner can connect online payments' : auth.message} />
  const status = await paymentStatusFor(auth.membership.tenantId).catch(() => null)
  if (!status) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const webhookUrl = status.connected ? `https://${CONSOLE_HOST}/api/webhooks/razorpay/${status.webhookKey}` : null
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/console/settings" className="text-sm text-muted-foreground hover:text-foreground">← Settings</Link>
      <h1 className="text-2xl font-bold tracking-tight">Online payments</h1>
      <OnlinePayments
        status={status.connected ? { keyId: status.keyId, mode: status.mode, webhookSeenAt: status.webhookSeenAt?.toISOString() ?? null, lastEventAt: status.lastEventAt?.toISOString() ?? null, problem: status.problem, webhookUrl: webhookUrl!,
          // Never to a Frata support visit (support acts as owner; with the secret it could sign a fake payment: audit 2026-11-07).
          webhookSecret: auth.membership.supportSessionId ? null : status.webhookSecret } : null}
        support={!!auth.membership.supportSessionId} available={isPaymentsConfigured()} />
    </div>
  )
}
