import { redirect } from 'next/navigation'
import { statusLabel, visibility, type Status } from '@/domains/catalogue/availability'
import type { ResolvedTheme } from '@/domains/themes/types'
import { previewBestSellers, previewCatalogue as readCatalogue, previewProduct, type StoreShop } from '@/lib/queries/storefront'
import { bestSellersFor, videosFor } from '@/lib/themes/page-look'
import { previewVideos } from '@/lib/queries/videos'
import { LoopPlayer } from './sections/loop-player'
import { isSampleHandle, sampleProduct, sampleSetFor, withSamples } from '@/lib/themes/sample'
import { BagPage } from './bag-page'
import { Checkout } from './checkout'
import { checkoutReturnLine } from './checkout-lines'
import { AllView, CollectionView, GoneView, HomeView, PolicyView, ShopNotFound } from './pages'
import { PageView } from './shop-pages'
import { previewPages } from '@/lib/queries/pages'
import { POLICY_TITLE } from './policy'
import { ProductView } from './product-view'
import type { Href } from './shell'

/** One shop page for the merchant's previews (drafts and unlisted pieces included, never cached), and a note on what
 *  shoppers see instead. Shared by /console/preview and the customizer's look preview. */
export async function previewPage(o: { tenantId: string; shop: StoreShop; path: string[]; href: Href; now: Date; theme: ResolvedTheme
  /** The customizer's look preview of a theme with samples (never /console/preview, which shows the shop as shoppers see it). */
  samples?: boolean
  /** TS0b: the customizer's look preview (never `?as=shop` or /console/preview): a design shows the theme's sample
   *  photos and example words, marked, whether or not the theme has sample pieces (impact review). */
  examples?: boolean }): Promise<{ body: React.ReactNode; note: string | null }> {
  const { tenantId, shop, path, href, now, theme, samples = false, examples = false } = o
  // Which sample set: by what the shop sells (theme Signal plan S0-1).
  const set = sampleSetFor(shop.sells)
  const [a, b, ...rest] = path
  const previewCatalogue = async (t: string) => { const c = await readCatalogue(t); return samples ? withSamples(c, now, set) : c }
  if (rest.length) return { body: <ShopNotFound href={href} lang={shop.shopLanguage} />, note: null }
  if (!a) {
    const [best, videos] = await Promise.all([bestSellersFor(theme, (d) => previewBestSellers(tenantId, d)), videosFor(theme, (k) => previewVideos(tenantId, k))])
    return { body: <><HomeView shop={shop} cat={await previewCatalogue(tenantId)} href={href} now={now} theme={theme} bestSellers={best} videos={videos} preview examples={examples} />{Object.keys(videos).length > 0 && <LoopPlayer />}</>, note: null }
  }
  if (a === 'products' && !b) return { body: <AllView cat={await previewCatalogue(tenantId)} href={href} now={now} lang={shop.shopLanguage} />, note: null }
  if (a === 'products' && b && /^[a-z0-9-]{1,100}$/.test(b)) {
    const r = await previewProduct(tenantId, b)
    if (r.kind === 'moved') redirect(href(`/products/${r.to}`))
    // A sample piece's page: only when the shop has no product of its own at this address. Not live: the bag is off.
    const sample = r.kind === 'none' && samples && isSampleHandle(b) ? sampleProduct(b, set) : null
    if (sample) return { body: <ProductView shop={shop} p={sample} now={now} layout={theme.settings} extras={theme.product} href={href} />, note: null }
    if (r.kind === 'none') return { body: <ShopNotFound href={href} lang={shop.shopLanguage} />, note: null }
    const p = r.product
    const v = visibility(p.status as Status, p.publishAt ? new Date(p.publishAt) : null, now)
    const label = statusLabel(p.status as Status, p.publishAt ? new Date(p.publishAt) : null, now)
    const note = !v.reachable ? `${label}: shoppers ${v.gone ? 'read that it is no longer available' : 'get "page not found"'} here.`
      : !v.listed ? 'Unlisted: shoppers with the link see this page; it is not in lists or search.' : null
    return { body: v.gone ? <GoneView title={p.title} cat={await previewCatalogue(tenantId)} href={href} now={now} lang={shop.shopLanguage} /> : <ProductView shop={shop} p={p} now={now} layout={theme.settings} extras={theme.product} href={href} />, note }
  }
  if (a === 'collections' && b) {
    const cat = await previewCatalogue(tenantId)
    const c = cat.collections.find((x) => x.handle === b)
    return { body: c ? <CollectionView c={c} cat={cat} href={href} now={now} top={theme.settings.collectionTop} lang={shop.shopLanguage} /> : <ShopNotFound href={href} lang={shop.shopLanguage} />, note: null }
  }
  // The bag and the checkout (Look v4: page-aware editing opens them), for their look: the bag here is the console's
  // own (empty), and the shop APIs answer only on the shop's host, so nothing is priced or placed from a preview.
  if (a === 'bag' && !b) return { body: <BagPage />, note: null }
  if (a === 'checkout' && !b) return { body: <Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={href('/policies/privacy')} returnLine={checkoutReturnLine(shop.returnKind, shop.returnDays)} gst={shop.gst} />, note: null }
  // TS1a: a page as its draft stands (hidden and unpublished too; the customizer marks examples, /console/preview not).
  if (a === 'pages' && b) {
    const p = (await previewPages(tenantId)).find((x) => x.handle === b)
    const note = p?.hidden ? 'Hidden: shoppers get "page not found" here.' : null
    return { body: p ? <PageView shop={shop} page={p} href={href} examples={examples} /> : <ShopNotFound href={href} lang={shop.shopLanguage} />, note }
  }
  if (a === 'policies' && b && Object.hasOwn(POLICY_TITLE, b)) return { body: <PolicyView shop={shop} page={b as keyof typeof POLICY_TITLE} contact={theme.contact} />, note: null }
  return { body: <ShopNotFound href={href} lang={shop.shopLanguage} />, note: null }
}
