import type { NextConfig } from 'next'
import { FRAMEABLE_HEADERS, SECURITY_HEADERS } from './src/lib/security-headers'
import { shopRewrites } from './src/domains/tenancy/host'
import { CONSOLE_HOST } from './src/lib/public-env'

const config: NextConfig = {
  reactStrictMode: true,
  // Every other host is a shop, served from /s/<host>/… (src/domains/tenancy/host.ts).
  async rewrites() {
    return { beforeFiles: shopRewrites(CONSOLE_HOST), afterFiles: [], fallback: [] }
  },
  // Every response may not be framed (DENY), except the customizer's look preview on the console host, which the
  // console itself frames (themes spec § Preview; a later entry can't remove X-Frame-Options, so the global entry
  // skips that path and two entries cover it: SAMEORIGIN on the console host, DENY on any other host).
  async headers() {
    return [
      { source: '/:path((?!console/theme-preview/).*)', headers: SECURITY_HEADERS },
      { source: '/console/theme-preview/:path*', has: [{ type: 'host', value: CONSOLE_HOST }], headers: FRAMEABLE_HEADERS },
      { source: '/console/theme-preview/:path*', missing: [{ type: 'host', value: CONSOLE_HOST }], headers: SECURITY_HEADERS },
    ]
  },
  images: {
    // One quality: the optimiser otherwise takes q=1…100 from the URL, and every
    // photo × width × quality is a transformation Vercel bills (Ekatan abuse audit).
    qualities: [75],
  },
}

export default config
