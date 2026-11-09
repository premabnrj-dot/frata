// =============================================================================
// FILE: src/domains/addresses/dns-hosts.ts — WHO RUNS A DOMAIN'S DNS, from its name servers (design rule 73).
// Only listed suffixes, matched on a label boundary; an unknown one shows no button (never a link built from an
// answer). The links are each provider's own DNS dashboard, with nothing of ours or the merchant's in them.
// Rows dated in frata-integrations § Domains (checked 2026-11-09; 90-day rule).
// =============================================================================

export type DnsHost = { name: string; url: string }

const HOSTS: { suffix: string; host: DnsHost }[] = [
  { suffix: 'domaincontrol.com', host: { name: 'GoDaddy', url: 'https://dcc.godaddy.com/control/portfolio' } },
  { suffix: 'ns.cloudflare.com', host: { name: 'Cloudflare', url: 'https://dash.cloudflare.com/' } },
  { suffix: 'dns-parking.com', host: { name: 'Hostinger', url: 'https://hpanel.hostinger.com/domains' } },
  { suffix: 'registrar-servers.com', host: { name: 'Namecheap', url: 'https://ap.www.namecheap.com/domains/list/' } },
  { suffix: 'vercel-dns.com', host: { name: 'Vercel', url: 'https://vercel.com/dashboard/domains' } },
]
const AWS = /^ns-\d+\.awsdns-\d+\.(com|net|org|co\.uk)$/

export function dnsHostOf(nameServers: string[]): DnsHost | null {
  for (const ns of nameServers.map((n) => n.toLowerCase().replace(/\.$/, ''))) {
    if (AWS.test(ns)) return { name: 'AWS Route 53', url: 'https://console.aws.amazon.com/route53/v2/hostedzones' }
    const hit = HOSTS.find((h) => ns === h.suffix || ns.endsWith(`.${h.suffix}`))
    if (hit) return hit.host
  }
  return null
}
