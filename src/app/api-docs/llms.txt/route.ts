import { llmsTxt } from '@/domains/storefront-api/docs'

// The docs for an agent (spec § 8), static on the API host: api.frrata.shop/llms.txt.
export const dynamic = 'force-static'
export const maxDuration = 10
export function GET() {
  return new Response(llmsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } })
}
