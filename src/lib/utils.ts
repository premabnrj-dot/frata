import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type roles (src/app/base.css @theme: text-section, -title, -display, -label, -small) are font SIZES: without
// this, twMerge read them as colours and `cn('text-section', 'text-muted-foreground')` dropped the size (Neel N0).
// Marked pure (2026-11-23, page weight): a page whose browser code imports this file but never calls cn() (a `button()`
// class from cva, say) drops tailwind-merge's 8.6 kB gzipped instead of building a merger at load and never using it.
const twMerge = /*#__PURE__*/ extendTailwindMerge({ extend: { theme: { text: ['section', 'title', 'display', 'label', 'small', 'kbd', 'stat', 'overline'], radius: ['mid'] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
