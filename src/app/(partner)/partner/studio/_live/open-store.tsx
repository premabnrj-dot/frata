'use client'

import { switchStoreAction } from '@/app/choose/actions'
import { Submit } from '@/components/ui/submit'

/** Entry state 1a's button: the store switch to the person's own partner store, back to Studio (OPEN_AT). */
export function OpenStore({ tenantId, name }: { tenantId: string; name: string }) {
  return (
    <form action={switchStoreAction}>
      <input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="to" value="/partner/studio" />
      <Submit size="sm">Open {name}</Submit>
    </form>
  )
}
