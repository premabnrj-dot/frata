import { describe, expect, it } from 'vitest'
import { cn } from '../utils'

describe('cn keeps the type roles (Neel N0)', () => {
  it('a size role and a colour together keep both', () => {
    expect(cn('text-section', 'text-muted-foreground')).toBe('text-section text-muted-foreground')
    expect(cn('text-label text-foreground')).toBe('text-label text-foreground')
  })
  it('a later size still wins over an earlier one', () => {
    expect(cn('text-sm', 'text-label')).toBe('text-label')
    expect(cn('text-title', 'text-2xl')).toBe('text-2xl')
  })
})
