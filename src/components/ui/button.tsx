import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const THREAD = 'relative overflow-hidden after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:bg-thread after:transition-[scale] after:duration-fast after:ease-standard hover:after:scale-x-100 focus-visible:after:scale-x-100 disabled:after:scale-x-0'

export const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // THE THREAD (brand spec, chapter 5): a 2 px rani line at the foot, a third wide; the full width on hover or
        // keyboard focus (a transform, check:motion). Secondary: on hover and focus only. Destructive and ghost: never,
        // so cancelling never looks like the brand's way forward. Disabled: none.
        primary: `bg-primary text-primary-foreground hover:bg-primary/90 ${THREAD} after:scale-x-[0.34]`,
        secondary: `border border-input bg-card hover:bg-accent ${THREAD} after:scale-x-0`,
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      // Height is a variant, never a className: twMerge drops a caller's h-11 against h-10 but keeps md:h-9 (impact review U·1).
      size: {
        default: 'h-10 px-3 text-sm md:h-9', // 40 px on phones, 36 px from 768 px (rule 19)
        lg: 'h-11 px-5 text-base', // sign-in, sign-up and the website's one call to action
        // A label that can be long (it names a merchant, § Frrata Admin): grows to two lines instead of overflowing.
        wrap: 'min-h-10 px-3 py-2 text-left text-sm whitespace-normal [overflow-wrap:anywhere] md:min-h-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export function Button({ variant, size, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />
}
