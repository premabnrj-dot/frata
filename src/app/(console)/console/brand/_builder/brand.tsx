import { Panel } from '@/components/ui/panel'
import { NowProvider } from '@/components/time/now'
import type { BuilderActor } from '@/lib/db/actor'
import { builderBrand, builderBrandSample } from '@/lib/queries/builder'
import { BrandEditor } from '../_components/brand-editor'

/**
 * Console › Brand for a partner's Builder (O9, mockup screen 6): every value as a fact, the preview, nothing that saves.
 * Read as frata_builder: the live record's named columns and the store's logo (drizzle/0155), never a waiting change,
 * who saved or the store's legal details (the invoice preview shows the store's name only).
 */
export async function BuilderBrand({ actor, shopName, at }: { actor: BuilderActor; shopName: string; at: string }) {
  const [record, product] = await Promise.all([
    builderBrand(actor).catch((err: unknown) => { console.error('[brand builder]', err instanceof Error ? err.name : err); return null }),
    builderBrandSample(actor).catch(() => null),
  ])
  if (!record) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  return (
    <NowProvider at={at}>
      <BrandEditor tenantId="" mode="preview" live={record} version={null} waiting={null} decides={false}
        sample={{ shopName, product, paper: { legalName: '', address: '', gstin: null, prefix: '' } }} tagline="" />
    </NowProvider>
  )
}
