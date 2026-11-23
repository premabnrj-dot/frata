import type { UseWhat } from '@/domains/studio/ledger'

// Credits and billing's words for a use's label (the ledger keeps a fixed vocabulary, tenancy M5).
export const USE_WORDS: Record<UseWhat, string> = {
  start: 'First draft', looks: 'Look and feel', home: 'Home', collection: 'Collection', product: 'Product', page: 'Page',
  edit: 'Small edit', fix: 'Fix', preview: 'Preview', logo: 'Logo',
}
