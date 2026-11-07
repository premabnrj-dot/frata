import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-input bg-card hover:bg-accent',
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      // Height is a variant, never a className: twMerge drops a caller's h-11 against h-10 but keeps md:h-9 (impact review U·1).
      size: {
        default: 'h-10 px-3 text-sm md:h-9', // 40 px on phones, 36 px from 768 px (rule 19)
        lg: 'h-11 px-5 text-base', // sign-in, sign-up and the website's one call to action
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export function Button({ variant, size, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />
}
