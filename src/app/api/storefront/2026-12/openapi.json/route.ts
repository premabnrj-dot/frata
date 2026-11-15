import { openApi } from '@/domains/storefront-api/2026-12/openapi'

// The published description of version 2026-12: no key, no shop data (check:tenant § 9's one entry point). Spec § 8.
export const maxDuration = 10
export const revalidate = 3600
export function GET() {
  return new Response(JSON.stringify(openApi()), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Frrata-Api-Version': '2026-12' } })
}
