// =============================================================================
// FILE: src/domains/analytics/visitor.ts — the input of a visit's pseudonymous id (A·2; security review MED-2). The
// analytics database turns it into HMAC(today's salt, shop ‖ input) and keeps only that (drizzle-analytics/0002,
// analytics_visitor); the address itself is never stored. The network, not the address: a /24 for IPv4 and a /48 for
// IPv6, so a phone that changes address inside its carrier's block stays one visitor for the day, and the input alone
// never names a device. Each part is length-prefixed, so two different inputs can never read the same. Pure.
// =============================================================================

/** The /24 (IPv4) or /48 (IPv6) of an address, or '' when it isn't one. */
export function networkOf(ip: string): string {
  const a = ip.trim().replace(/^\[|\](:\d+)?$/g, '').split('%')[0]!
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a.replace(/^::ffff:/i, ''))
  if (v4) return v4.slice(1, 5).every((o) => Number(o) <= 255) ? `${Number(v4[1])}.${Number(v4[2])}.${Number(v4[3])}` : ''
  if (!/^[0-9a-f:]+$/i.test(a) || !a.includes(':') || (a.match(/::/g)?.length ?? 0) > 1) return ''
  const [head, tail] = a.includes('::') ? a.split('::') : [a, null]
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return ''
  return groups.slice(0, 3).map((g) => parseInt(g, 16).toString(16)).join(':')
}

/** The visitor input: the network and the User-Agent (capped), each length-prefixed. */
export function visitorInput(ip: string, ua: string): string {
  const net = networkOf(ip)
  const agent = ua.slice(0, 300)
  return `${net.length}:${net}|${agent.length}:${agent}`
}
