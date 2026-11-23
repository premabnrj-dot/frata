import Link from 'next/link'
import type { ReactNode } from 'react'

/** A filter or period choice as a link, as drawn (mockup § All costs, § Payments): one place for its look. */
export function ChipLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={current ? 'true' : undefined}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-label font-medium md:h-8 ${current ? 'border-select bg-select text-select-foreground' : 'border-line-soft text-muted-foreground hover:bg-accent'}`}>{children}</Link>
  )
}
