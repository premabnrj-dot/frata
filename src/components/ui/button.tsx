import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const button = cva(
  'inline-flex h-10 md:h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-input bg-card hover:bg-accent',
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

export function Button({ variant, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant }), className)} {...props} />
}
