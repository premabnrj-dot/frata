import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type roles (src/app/base.css @theme: text-section, -title, -display, -label, -small) are font SIZES: without
// this, twMerge read them as colours and `cn('text-section', 'text-muted-foreground')` dropped the size (Neel N0).
const twMerge = extendTailwindMerge({ extend: { theme: { text: ['section', 'title', 'display', 'label', 'small', 'kbd'] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
