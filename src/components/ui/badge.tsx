import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Status is always a Badge with words, never a coloured dot alone. */
export const badge = cva('inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      ok: 'bg-ok text-ok-text',
      warn: 'bg-warn text-warn-text',
      danger: 'bg-danger text-danger-text',
      info: 'bg-info text-info-text',
      neutral: 'bg-neutral text-neutral-text',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ tone, className, children }: VariantProps<typeof badge> & { className?: string; children: React.ReactNode }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>
}
