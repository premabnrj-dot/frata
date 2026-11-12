import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Status is always a Badge with words, never a coloured dot alone. In Neel ([data-neel], src/app/neel.css) it is a
 * 22 px pill with a 6 px dot before the word (the dot is the tone's mark, ≥ 3:1); outside Neel it keeps its square tint. */
export const badge = cva('badge inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      ok: 'bg-ok text-ok-text [--badge-dot:var(--ok-mark)]',
      warn: 'bg-warn text-warn-text [--badge-dot:var(--warn-mark)]',
      danger: 'bg-danger text-danger-text [--badge-dot:var(--danger-mark)]',
      info: 'bg-info text-info-text [--badge-dot:var(--info-mark)]',
      neutral: 'bg-neutral text-neutral-text [--badge-dot:var(--neutral-mark)]',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ tone, className, children }: VariantProps<typeof badge> & { className?: string; children: React.ReactNode }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>
}

/** A fact that is not a status (a category, "Made to order", a channel): outlined, text 2, 6 px corners. Neel only. */
export function Tag({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex h-[22px] items-center rounded-sm border border-border bg-card px-[7px] text-small font-medium whitespace-nowrap text-muted-foreground', className)}>{children}</span>
}
