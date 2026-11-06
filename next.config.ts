import type { NextConfig } from 'next'
import { SECURITY_HEADERS } from './src/lib/security-headers'
import { shopRewrites } from './src/domains/tenancy/host'
import { CONSOLE_HOST } from './src/lib/public-env'

const config: NextConfig = {
  reactStrictMode: true,
  // Every other host is a shop, served from /s/<host>/… (src/domains/tenancy/host.ts).
  async rewrites() {
    return { beforeFiles: shopRewrites(CONSOLE_HOST), afterFiles: [], fallback: [] }
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  images: {
    // One quality: the optimiser otherwise takes q=1…100 from the URL, and every
    // photo × width × quality is a transformation Vercel bills (Ekatan abuse audit).
    qualities: [75],
  },
}

export default config
