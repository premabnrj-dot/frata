// =============================================================================
// FILE: src/domains/email/partner-credits.ts — THE PARTNER'S STUDIO CREDIT EMAILS (C1·6; words from the approved mockup
// docs/mockups/2026-11-22-c1-undrawn.html § Emails, owner 2026-11-22, after words-reviewer). Pure: figures already
// formatted in, subject, body and button out. The RBI pre-debit notice carries what the e-mandate framework lists
// (frata-integrations § Merchant billing): who takes it (Frrata, the sender), the amount, the date and time, the
// mandate's reference and the reason.
// =============================================================================

export type CreditMail = { subject: string; body: string; button: { label: string; path: string } | null }

export type MailFacts =
  | { kind: 'low'; balance: string }
  | { kind: 'budget_80'; client: string; used: string; budget: string; forLead: boolean; ownerFirstName: string }
  | { kind: 'predebit'; amount: string; day: string; time: string; method: 'upi' | 'card'; ref: string; plan: string; month: string }
  | { kind: 'renewal_failed'; day: string; amount: string; retries: [string, string, string]; lapseDay: string }
  | { kind: 'paid'; amount: string; what: string; invoice: string | null }
  | { kind: 'details_changed'; name: string }

const PAGE = '/partner/credits'

export function creditMail(f: MailFacts): CreditMail {
  switch (f.kind) {
    case 'low':
      return { subject: 'Your Studio credits are below 50', body: `You have ${f.balance} credits. Turns that need more will wait.`, button: { label: 'Buy credits', path: PAGE } }
    case 'budget_80':
      return {
        subject: `${f.client} has used 80% of its budget`,
        body: f.forLead
          ? `${f.used} of ${f.budget} credits. Its turns wait at ${f.budget} credits. Ask ${f.ownerFirstName} to raise it.`
          : `${f.used} of ${f.budget} credits. Its turns wait at ${f.budget} credits. Raise the budget to keep them going.`,
        button: f.forLead ? null : { label: 'Open client budgets', path: `${PAGE}?tab=budgets` },
      }
    case 'predebit':
      return {
        subject: `${f.amount} for ${f.plan} on ${f.day}`,
        body: `We’ll take ${f.amount} from ${f.method === 'upi' ? 'UPI AutoPay' : 'your card'} ••••${f.ref} on ${f.day}, after ${f.time}. This pays ${f.plan} for ${f.month}.\nTo stop it, cancel ${f.plan} before then.`,
        button: { label: 'Manage Studio', path: `${PAGE}?tab=plan` },
      }
    case 'renewal_failed':
      return {
        subject: `The ${f.day} payment for Studio didn’t go through`,
        body: `Your credits still work. We’ll try again on ${f.retries[0]}, ${f.retries[1]} and ${f.retries[2]}. You get a notice the day before each. If the last try fails, your plan becomes Partner on ${f.lapseDay}.`,
        button: { label: `Pay ${f.amount}`, path: PAGE },
      }
    case 'paid':
      return {
        subject: `Paid: ${f.amount} for ${f.what}`,
        body: f.invoice ? `Invoice ${f.invoice} is in Credits and billing.` : 'Your invoice is in Credits and billing.',
        button: { label: 'See the invoice', path: `${PAGE}?tab=payments` },
      }
    case 'details_changed':
      return { subject: 'Your invoice details changed', body: `Invoices from now on go to ${f.name}. Not you? Tell Frrata now.`, button: { label: 'See invoice details', path: `${PAGE}?tab=payments` } }
  }
}
