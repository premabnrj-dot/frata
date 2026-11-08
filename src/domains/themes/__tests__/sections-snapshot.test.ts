import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CollectionTilesSchema, HeroSchema, ProductsSchema, SectionSchema } from '../sections'
import stored from './fixtures/stored-sections-v1.json'

// Section schemas change ADDITIVELY only (themes plan, architecture review): a stored layer must stay valid
// forever. A new optional field with a default updates this snapshot on purpose; anything else is a new section key.
describe('section schemas', () => {
  it.each([['hero', HeroSchema], ['collection_tiles', CollectionTilesSchema], ['products', ProductsSchema]] as const)('%s keeps its shape', (_k, s) => {
    expect(z.toJSONSchema(s, { io: 'input' })).toMatchSnapshot()
  })
})

// The real guard for "additive only": sections as they were stored stay valid under today's schemas. A schema
// change that breaks one of these is a breaking change: make a new section key instead. Append, never edit, fixtures.
describe('stored sections stay valid', () => {
  it.each(stored.map((s) => [s.id, s] as const))('%s', (_id, s) => expect(SectionSchema.safeParse(s).success).toBe(true))
})
