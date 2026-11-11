// =============================================================================
// FILE: src/domains/email/headers.ts — WHAT GOES INTO A HEADER (security review M6). Pure. A display name loses quotes,
// angle brackets, commas, semicolons and control characters, then is RFC 2047-encoded when it isn't plain ASCII; a
// subject loses control characters and is capped at 150.
// =============================================================================

const CONTROL = /[\u0000-\u001f\u007f]/g

export function fromHeader(displayName: string, address: string): string {
  const name = displayName.replace(CONTROL, ' ').replace(/["<>,;\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Orders'
  const encoded = /^[\x20-\x7e]*$/.test(name) ? `"${name}"` : `=?UTF-8?B?${Buffer.from(name, 'utf8').toString('base64')}?=`
  return `${encoded} <${address}>`
}

export const cleanSubject = (s: string) => s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
