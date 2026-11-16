import { sql } from 'drizzle-orm'

/** A brand file in this store's own folder of Frrata's media store, the host pinned (one-address P1·2; tenancy audit): a raster logo as the photo ladder stores it
 *  (`<uuid>-400.webp|jpg`), or a cleaned SVG named by its sha256. `shop_settings.logo_url` and brand_tokens' files. */
export const brandFileCheck = (url: unknown, tenantId: unknown) =>
  sql`${url} is null or ${url} ~ ('^https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/tenants/' || ${tenantId}::text || '/brand/([0-9a-f-]{36}-400\\.(webp|jpg)|[0-9a-f]{64}\\.svg)$')`
