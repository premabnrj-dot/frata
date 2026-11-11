import type { NextConfig } from 'next'
import { FRAMEABLE_HEADERS, HSTS_PLATFORM, hostValue, platformHostPattern, SECURITY_HEADERS } from './src/lib/security-headers'
import { shopRewrites } from './src/domains/tenancy/host'
import { CONSOLE_HOST, EKCODE_HOST, SHOP_DOMAIN } from './src/lib/public-env'

const config: NextConfig = {
  reactStrictMode: true,
  // Documents (D0): React-PDF runs on the server only, as itself; its fonts are files read at render, so they are
  // traced into every function that may make a document (src/lib/documents/fonts.ts).
  serverExternalPackages: ['@react-pdf/renderer'],
  // Our vendored fonts, and pdfkit's standard fonts: pdfkit loads them through its package "imports" map
  // ('#standard-fonts/…'), which the file tracer cannot follow — without them every PDF fails in production with
  // MODULE_NOT_FOUND Helvetica.cjs (2026-11-08). scripts/check-pdf-trace.mjs (postbuild) renders a PDF from the traced
  // files alone and fails the build if anything is missing.
  outputFileTracingIncludes: { '/**': ['./src/lib/documents/fonts/**', './node_modules/pdfkit/js/standard-fonts/**/*.cjs', './node_modules/pdfkit/package.json'] },
  // Every other host is a shop, served from /s/<host>/… (src/domains/tenancy/host.ts).
  async rewrites() {
    return { beforeFiles: shopRewrites(CONSOLE_HOST, EKCODE_HOST), afterFiles: [], fallback: [] }
  },
  // Every response may not be framed (DENY), except the customizer's look preview on the console host, which the
  // console itself frames (themes spec § Preview; a later entry can't remove X-Frame-Options, so the global entry
  // skips that path and two entries cover it: SAMEORIGIN on the console host, DENY on any other host).
  async headers() {
    return [
      { source: '/:path((?!console/theme-preview/).*)', headers: SECURITY_HEADERS },
      { source: '/console/theme-preview/:path*', has: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: FRAMEABLE_HEADERS },
      { source: '/console/theme-preview/:path*', missing: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: SECURITY_HEADERS },
      // The visit beacon: its URL carries its content hash (?v=, scripts/build-beacon.mjs), so it is cached for good.
      { source: '/fe.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // Last, so it replaces the own-domain HSTS above on our own hosts (D2·1).
      { source: '/:path*', has: [{ type: 'host', value: platformHostPattern(CONSOLE_HOST, SHOP_DOMAIN, EKCODE_HOST) }], headers: [HSTS_PLATFORM] },
    ]
  },
  images: {
    // One quality: the optimiser otherwise takes q=1…100 from the URL, and every
    // photo × width × quality is a transformation Vercel bills (Ekatan abuse audit).
    qualities: [75],
  },
}

export default config
