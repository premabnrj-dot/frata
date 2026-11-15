import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icons/icon'
import { BUILDER_REFUSED } from '@/domains/tenancy/roles'
import { button } from './button'

/**
 * One frame for every state that is not data: empty, no access, setup needed,
 * error. A title that says what is true, one sentence of why, and one way on.
 */
export function Panel({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  // A Builder on a page that isn't theirs (T1c, approved mockup screens 10 and 11): every page already renders its
  // refusal as a Panel with requireMember's words, so the one way on is drawn here, not in 55 pages.
  if (title === BUILDER_REFUSED && !children && !action) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-3.5 rounded-md border border-border bg-card p-6 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon name="lock" className="size-7" /></span>
        <h2 className="text-lg font-medium">{title}</h2>
        <Link href="/console/products" className={button()}>Open products</Link>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md rounded-md border border-border bg-card p-6 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
