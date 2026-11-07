import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A card that is one link as a whole (Home's next order, U·4): the Section frame, a hover edge, the focus ring.
 * Row links never prefetch (a page of them would be a page of server renders).
 */
export function CardLink({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string } & Record<`data-${string}`, string | boolean>) {
  return (
    <Link href={href} prefetch={false} {...rest} className={cn('block rounded-md border border-border bg-card px-4 py-3 hover:border-input', className)}>
      {children}
    </Link>
  )
}
