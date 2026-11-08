import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CollectionTilesSchema, HeroSchema, ProductsSchema } from '../sections'

// Section schemas change ADDITIVELY only (themes plan, architecture review): a stored layer must stay valid
// forever. A new optional field with a default updates this snapshot on purpose; anything else is a new section key.
describe('section schemas', () => {
  it.each([['hero', HeroSchema], ['collection_tiles', CollectionTilesSchema], ['products', ProductsSchema]] as const)('%s keeps its shape', (_k, s) => {
    expect(z.toJSONSchema(s, { io: 'input' })).toMatchSnapshot()
  })
})
