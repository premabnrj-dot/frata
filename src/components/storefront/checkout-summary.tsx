'use client'

import { useErrorSummary, type Errors } from '@/components/ui/field-error'
import { ToastContext, type ToastApi } from '@/components/ui/toast-context'

// =============================================================================
// FILE: src/components/storefront/checkout-summary.tsx — the checkout's field summary (frata-design-language
// § Feedback 3): focus on the first wrong field and ONE quiet "2 details need fixing" toast with Show, counting down as
// they are fixed. Its own chunk (checkout's first-load budget): the checkout loads it after the page, and draws it from
// the first submit with mistakes. The shop's toast is handed in (none in the console's preview: a silent one).
// =============================================================================

export default function CheckoutSummary({ toast, errors, attempt, sub, scope }: { toast: ToastApi; errors: Errors; attempt: number; sub?: string; scope: React.RefObject<HTMLFormElement | null> }): React.ReactNode {
  return <ToastContext.Provider value={toast}><Summary errors={errors} attempt={attempt} sub={sub} scope={scope} /></ToastContext.Provider>
}

function Summary({ errors, attempt, sub, scope }: { errors: Errors; attempt: number; sub?: string; scope: React.RefObject<HTMLFormElement | null> }): React.ReactNode {
  useErrorSummary(errors, { attempt, noun: 'detail', scope, sub })
  return null
}
