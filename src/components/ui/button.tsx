import { useId } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// THE THREAD (brand spec, chapter 5): a 2 px rani line at the foot, a third wide; the full width on hover or keyboard
// focus (a transform, check:motion). It stays on brand surfaces (the website, sign-in, the store); in the console,
// Frrata Admin and the partner workspace ([data-neel]) a button has no thread (Neel N0, src/app/neel.css).
const THREAD = 'thread relative after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:origin-left after:bg-thread after:transition-[scale] after:duration-fast after:ease-standard hover:after:scale-x-100 focus-visible:after:scale-x-100 disabled:after:scale-x-0'

// Every value here is the same outside [data-neel] as it was before Neel: Neel's own looks come from its tokens
// (radius, e1, the edge, primary-hover, --btn-h) and the few rules on `.btn` in neel.css.
export const button = cva(
  'btn inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary a third of a thread; secondary on hover and focus only; destructive and ghost never, so cancelling
        // never looks like the brand's way forward. Disabled: none.
        primary: `bg-primary text-primary-foreground hover:bg-primary-hover ${THREAD} after:scale-x-[0.34]`,
        // Neel: white, the g300 edge and e1 (outside Neel the edge is the field edge and e1 draws nothing).
        secondary: `border border-edge bg-card shadow-sm hover:bg-accent ${THREAD} after:scale-x-0`,
        // Paper on an ink stage (the website's hero, website spec W·1), with the thread.
        inverse: `bg-primary-foreground text-primary hover:bg-primary-foreground/90 ${THREAD} after:scale-x-[0.34]`,
        ghost: 'btn-ghost hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Neel: a link that acts ("View in store"): neel 700, underlined on hover, no box (its target is the row's height).
        link: 'btn-link text-link underline-offset-2 hover:underline',
      },
      // Height is a variant, never a className: twMerge drops a caller's h-11 against the variant's height but keeps md:h-9 (impact review U·1).
      size: {
        default: 'h-[var(--btn-h,2.5rem)] px-3 text-sm md:h-9', // 40 px on a phone (44 in Neel), 36 px from 768 px
        sm: 'btn-sm h-11 px-2.5 text-label md:h-7.5', // Neel: a row's action, a table's toolbar (44 on a phone)
        lg: 'h-11 px-5 text-base', // sign-in, sign-up and the website's one call to action
        // A label that can be long (it names a merchant, § Frrata Admin): grows to two lines instead of overflowing.
        wrap: 'min-h-[var(--btn-h,2.5rem)] px-3 py-2 text-left text-sm whitespace-normal [overflow-wrap:anywhere] md:min-h-9',
      },
    },
    // A link is bare text whatever the size: no box, 24 px tall at least (its row gives the phone's 44).
    compoundVariants: [{ variant: 'link', class: 'h-auto min-h-6 px-0 md:h-auto' }],
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & {
  /** A save or send in flight: the label stays, a spinner joins it, and a second press does nothing. aria-disabled,
   * not disabled: a disabled button drops keyboard focus to the page (Neel § States). */
  busy?: boolean
  /** Why it cannot be pressed now (Neel § States: "Off"): the button stays reachable by keyboard (aria-disabled) and
   * the reason sits beside it, tied by aria-describedby. Prefer this to a bare `disabled`. */
  reason?: string
}

export function Button({ variant, size, className, busy, disabled, reason, children, onClick, ...props }: Props) {
  const rid = useId()
  if (reason) return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <button {...props} type="button" className={cn(button({ variant, size }), 'cursor-not-allowed', className)} aria-disabled="true" aria-describedby={rid}>{children}</button>
      <span id={rid} className="text-label text-muted-foreground">{reason}</span>
    </span>
  )
  return (
    <button className={cn(button({ variant, size }), busy && 'cursor-progress', className)} disabled={disabled} aria-disabled={busy || undefined}
      aria-busy={busy || undefined} {...props}
      // Only a busy button takes over the click (a server component may render Button and cannot pass a function).
      onClick={busy ? (e) => e.preventDefault() : onClick}>
      {busy && <Spinner />}
      {children}
    </button>
  )
}

/** A 12 px ring that turns (stilled under reduced motion: the label and aria-busy carry the meaning). */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={cn('size-3 shrink-0 animate-spin motion-reduce:animate-none', className)}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
