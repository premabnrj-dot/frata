import type { NextConfig } from 'next'
import { SECURITY_HEADERS } from './src/lib/security-headers'

const config: NextConfig = {
  reactStrictMode: true,
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
