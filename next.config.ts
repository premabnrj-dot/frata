import type { NextConfig } from 'next'
import { ADMIN_PASSKEY_HEADERS, FRAMEABLE_HEADERS, HSTS_PLATFORM, hostValue, platformHostPattern, SECURITY_HEADERS } from './src/lib/security-headers'
import { apiRedirects, apiRewrites, shopRewrites } from './src/domains/tenancy/host'
import { API_HOST, CONSOLE_HOST, EKCODE_HOST, SHOP_DOMAIN } from './src/lib/public-env'

/** The client entries that render AppShell (their layouts import it): webpack names an entry by its app path. */
const APP_SHELL_ENTRY = /^app\/\((?:console|admin|lookeditor)\)\/|^app\/\(partner\)\/partner\/\(workspace\)\//

const config: NextConfig = {
  reactStrictMode: true,
  // Documents (D0): React-PDF runs on the server only, as itself; its fonts are files read at render, so they are
  // traced into every function that may make a document (src/lib/documents/fonts.ts).
  serverExternalPackages: ['@react-pdf/renderer'],
  // Our vendored fonts, and pdfkit's standard fonts: pdfkit loads them through its package "imports" map
  // ('#standard-fonts/…'), which the file tracer cannot follow — without them every PDF fails in production with
  // MODULE_NOT_FOUND Helvetica.cjs (2026-11-08). scripts/check-pdf-trace.mjs (postbuild) renders a PDF from the traced
  // files alone and fails the build if anything is missing.
  outputFileTracingIncludes: {
    '/**': ['./src/lib/documents/fonts/**', './node_modules/pdfkit/js/standard-fonts/**/*.cjs', './node_modules/pdfkit/package.json'],
    // Studio's Starter 0 (src/lib/studio/starter.ts): read only by the Send action, on the Studio page's function.
    '/partner/studio': ['./kit/starter/**/*', '!./kit/starter/node_modules/**'],
  },
  // The Storefront API's host first (ADR-0018), then every other host is a shop, served from /s/<host>/…
  // (src/domains/tenancy/host.ts).
  // The API host's root goes to its docs (SA1b D·9).
  async redirects() {
    return apiRedirects(API_HOST)
  },
  async rewrites() {
    return { beforeFiles: [...apiRewrites(API_HOST), ...shopRewrites(CONSOLE_HOST, SHOP_DOMAIN, EKCODE_HOST, API_HOST)], afterFiles: [], fallback: [] }
  },
  // Every response may not be framed (DENY), except the customizer's look preview and the store preview on the console
  // host, which the console itself frames (themes spec § Preview; Studio's preview pane, V3a R7). A later entry can't
  // remove X-Frame-Options, so the global entry skips those paths and two entries cover each: SAMEORIGIN on the console
  // host, DENY on any other host.
  async headers() {
    return [
      { source: '/:path((?!console/theme-preview/|console/preview(?:/|$)).*)', headers: SECURITY_HEADERS },
      ...['/console/preview', '/console/preview/:path*'].flatMap((source) => [
        { source, has: [{ type: 'host' as const, value: hostValue(CONSOLE_HOST) }], headers: FRAMEABLE_HEADERS },
        { source, missing: [{ type: 'host' as const, value: hostValue(CONSOLE_HOST) }], headers: SECURITY_HEADERS },
      ]),
      { source: '/console/theme-preview/:path*', has: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: FRAMEABLE_HEADERS },
      { source: '/console/theme-preview/:path*', missing: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: SECURITY_HEADERS },
      // Admin on the console host may ask for a passkey (a later entry replaces the same header key).
      { source: '/admin/:path*', has: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: ADMIN_PASSKEY_HEADERS },
      { source: '/admin', has: [{ type: 'host', value: hostValue(CONSOLE_HOST) }], headers: ADMIN_PASSKEY_HEADERS },
      // Partner people's passkeys (T1b): the workspace, and the first-party pages that lead into it without a full page
      // load (join, the email link): a document keeps the policy it loaded with, so a gate reached from /join by in-app
      // navigation would otherwise be refused. None of them shows merchant content. /login and the console stay denied:
      // /login sends a partner on with a full page load (sign-in-flow.tsx).
      ...['/partner/:path*', '/partner', '/join', '/auth/confirm'].map((source) => ({ source, has: [{ type: 'host' as const, value: hostValue(CONSOLE_HOST) }], headers: ADMIN_PASSKEY_HEADERS })),
      // The visit beacon: its URL carries its content hash (?v=, scripts/build-beacon.mjs), so it is cached for good.
      { source: '/fe.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // Last, so it replaces the own-domain HSTS above on our own hosts (D2·1).
      { source: '/:path*', has: [{ type: 'host', value: platformHostPattern(CONSOLE_HOST, SHOP_DOMAIN, EKCODE_HOST) }], headers: [HSTS_PLATFORM] },
    ]
  },
  // The shop's bag store, the small modules every shop island shares with the shell's bag button, and the rail counter
  // (the shell's strip and a page's product rail), in ONE chunk: under webpack's 20 kB minSize each page's chunk carried
  // its own copy beside the layouts' (speed review 2026-11-16: about 1.3 kB twice on checkout and the product page, the
  // counter 0.5 kB twice on the product page). check:storefront-build holds the pages' weight.
  webpack(config, { dev, isServer }) {
    const split = config.optimization?.splitChunks
    if (!dev && !isServer && split && split.cacheGroups) {
      split.cacheGroups.shopShared = {
        name: 'shop-shared', chunks: 'all', enforce: true, priority: 20,
        test: /[\\/]src[\\/](components[\\/]storefront[\\/](bag-store|bag-words|close-mark|landing|chunk|sections[\\/]rail-counter)\.tsx?|domains[\\/]checkout[\\/]bag-fill\.ts)$/,
      }
      // The shell's browser modules (AppShell's navs, Toaster, progress bar and live region, and the Button and cn()
      // every page beside them uses), in ONE chunk for the pages that draw the shell: Console, Admin, the partner
      // workspace and the customizer. Each was in the layout's chunk AND again in a page's shared chunk, the same
      // minSize split as the shop's above (page weight 2026-11-23: 4.6–7.1 kB gzipped twice on most of those pages).
      // Only those surfaces' chunks take part: a page elsewhere that imports Button keeps its own copy, never the navs.
      split.cacheGroups.appShell = {
        name: 'app-shell', enforce: true, priority: 20,
        chunks: (chunk: { name?: string | null }) => APP_SHELL_ENTRY.test(chunk.name ?? ''),
        test: /[\\/]src[\\/](components[\\/](shell[\\/](nav|nav-progress|rail-toggle|announce)|ui[\\/](toast|toast-context|button|use-shortcuts)|icons[\\/]icon)\.tsx?|lib[\\/]utils\.ts|domains[\\/]ui[\\/]shortcuts\.ts)$/,
      }
    }
    return config
  },
  images: {
    // One quality: the optimiser otherwise takes q=1…100 from the URL, and every
    // photo × width × quality is a transformation Vercel bills (Ekatan abuse audit).
    qualities: [75],
  },
}

export default config
