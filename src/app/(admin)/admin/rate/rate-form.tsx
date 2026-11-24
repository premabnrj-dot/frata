'use client'

import { ActionForm, FieldMessage, type ActionResult } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { FIELD } from '@/components/ui/field'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { setRateAction } from './actions'

// The day's rate, as drawn (mockup § 1): one field and Save rate. A passkey check older than 5 minutes is asked for, then
// the same form is sent again (as Admin's other money actions do).
async function save(form: FormData): Promise<ActionResult> {
  let r = await setRateAction(form)
  if (r?.error === STAFF_CONFIRM_FIRST) {
    const c = await confirmPasskey()
    if (!c.ok) return { error: c.error }
    r = await setRateAction(form)
  }
  return r
}

/** `value`: today's rate when one is saved (as drawn), so a second save today starts from it. */
export function RateForm({ label, value }: { label: string; value: string }) {
  return (
    <ActionForm action={save} className="flex flex-wrap items-end gap-2.5">
      <div className="grid w-full max-w-80 gap-1.5">
        <label htmlFor="rate" className="text-label">{label}</label>
        <input id="rate" name="rate" defaultValue={value} key={value} inputMode="decimal" autoComplete="off" required maxLength={12} pattern="\d{2,3}(\.\d{1,4})?"
          data-error="Type rupees with up to 4 decimals, like 94.1997." className={`${FIELD} font-num`} />
        <FieldMessage name="rate" />
      </div>
      <Submit className="w-full sm:w-auto">Save rate</Submit>
    </ActionForm>
  )
}
