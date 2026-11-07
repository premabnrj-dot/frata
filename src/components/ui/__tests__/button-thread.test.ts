import { describe, expect, it } from 'vitest'
import { button } from '../button'

// The thread (brand rule 37): primary a third wide, secondary on hover and focus only, never on destructive or ghost
// buttons, never disabled; and nothing that would clip a wrapping label.
describe('the thread on buttons', () => {
  it('is on primary and secondary, off destructive and ghost', () => {
    expect(button({ variant: 'primary' })).toContain('after:bg-thread')
    expect(button({ variant: 'primary' })).toContain('after:scale-x-[0.34]')
    expect(button({ variant: 'secondary' })).toContain('after:scale-x-0')
    expect(button({ variant: 'destructive' })).not.toContain('after:bg-thread')
    expect(button({ variant: 'ghost' })).not.toContain('after:bg-thread')
  })
  it('grows on hover and keyboard focus only, never when disabled, and never clips', () => {
    const p = button({ variant: 'primary' })
    expect(p).toContain('hover:after:scale-x-100'); expect(p).toContain('focus-visible:after:scale-x-100'); expect(p).toContain('disabled:after:scale-x-0')
    expect(p).not.toMatch(/\bfocus:after/); expect(p).not.toContain('overflow-hidden')
  })
})
