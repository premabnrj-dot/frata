import { describe, expect, it, vi } from 'vitest'
import { Guarded, type SectionCtx } from '../sections'
import { SectionSchema } from '@/domains/themes/sections'

// A section that throws while it reads its data is left out of the shop and named in the customizer's preview
// (plan 2026-11-09-themes-three; impact review: the guard must call the section, not return an element for later).
describe('a guarded section', () => {
  const s = SectionSchema.parse({ id: 'n', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 4 })
  const broken = { cat: null } as unknown as SectionCtx
  it('on the shop: nothing, and only its error name is logged', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(Guarded({ s, ctx: broken })).toBeNull()
    expect(log).toHaveBeenCalledWith('section failed', 'products', 'TypeError')
    log.mockRestore()
  })
  it('in the preview: says it couldn’t be shown', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = Guarded({ s, ctx: { ...broken, preview: true } }) as { props: { role: string; children: string } }
    expect(el.props.role).toBe('status')
    expect(el.props.children).toMatch(/couldn’t be shown/)
    log.mockRestore()
  })
})
