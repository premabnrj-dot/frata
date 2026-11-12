import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { createMerchantAction } from './actions'
import { Section } from '@/components/layout/section'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Add merchant' }

const field = FIELD

export default async function NewMerchantPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  return (
    <>
      <PageHeader title="Add a merchant" back={{ href: '/admin/merchants', label: 'Merchants' }} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Section className="w-full max-w-xl"><ActionForm action={createMerchantAction} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">Brand name</label>
            <input id="name" name="name" required minLength={2} maxLength={80} data-error="Give the brand's name." className={field} />
            <FieldMessage name="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="slug" className="text-sm font-medium">Shop address</label>
            <div className="flex overflow-hidden rounded-md border border-input has-[[aria-invalid=true]]:border-danger-mark">
              <input id="slug" name="slug" required pattern="[a-z0-9-]+" data-error="Lower-case letters, digits and hyphens." className="h-10 flex-1 bg-card px-3 font-mono text-sm" />
              <span className="flex items-center border-l border-border bg-muted px-3 font-mono text-sm text-muted-foreground">.{SHOP_DOMAIN}</span>
            </div>
            <FieldMessage name="slug" />
            <span className="text-xs text-muted-foreground">Lower-case letters, digits and hyphens.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ownerEmail" className="text-sm font-medium">Owner&apos;s email</label>
            <input id="ownerEmail" name="ownerEmail" type="email" required autoComplete="off" data-error="Enter the owner's email." className={`${field} font-mono`} />
            <FieldMessage name="ownerEmail" />
            <span className="text-xs text-muted-foreground">They get a sign-in link. Signing in with this email, once confirmed, makes them the owner.</span>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Plan</legend>
            <div className="grid grid-cols-3 gap-2">
              {[['launch', 'Launch', '₹1,499/mo'], ['growth', 'Growth', '₹4,999/mo'], ['scale', 'Scale', '₹14,999/mo']].map(([code, name, price]) => (
                <label key={code} className="flex flex-col gap-0.5 rounded-md border border-input p-3 text-sm has-[:checked]:border-2 has-[:checked]:border-primary">
                  <span className="flex items-center gap-2"><input type="radio" name="planCode" value={code} defaultChecked={code === 'growth'} /><strong>{name}</strong></span>
                  <span className="font-mono text-muted-foreground">{price}</span>
                </label>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Prices are the current version of each plan; see Plans.</span>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trialEndsAt" className="text-sm font-medium">Trial ends <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="trialEndsAt" name="trialEndsAt" type="date" className={`${field} w-48`} />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Link href="/admin/merchants" className={button({ variant: 'secondary' })}>Cancel</Link>
            <Submit>Add merchant and email the owner</Submit>
          </div>
        </ActionForm></Section>
        <aside className="max-w-sm space-y-3 text-sm leading-relaxed text-muted-foreground">
          <h2 className="text-section font-semibold text-foreground">What happens</h2>
          <p>The store is created with its shop address and plan. The owner gets an email with a sign-in link; the store shows &quot;Owner not signed in yet&quot; until they use it.</p>
          <p>You can open the store&apos;s console straight away to set it up. That is a support visit, and the owner will see it.</p>
        </aside>
      </div>
    </>
  )
}
