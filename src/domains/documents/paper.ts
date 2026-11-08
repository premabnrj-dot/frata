// =============================================================================
// FILE: src/domains/documents/paper.ts — the rules a document on paper follows (Documents D0, spec 2026-11-08).
//
// Pure. A shop's colour appears on its documents only where it reads on white paper (4.5:1, the same WCAG test
// as the console's tokens); otherwise the paper's ink. A file is named for what it is, by the shop's own name, in
// plain ASCII with a UTF-8 copy for a Hindi name (RFC 6266 / 5987).
// =============================================================================

import { contrast } from '@/domains/themes/contrast'

export const PAPER = { white: '#FFFFFF', ink: '#1C1917', sub: '#57514C', line: '#DEDAD5', stamp: '#B42318' } as const

/** The shop's colour for a document's one rule and headings, or ink when it would not read on paper. */
export function paperAccent(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return PAPER.ink
  return contrast(hex, PAPER.white) >= 4.5 ? hex : PAPER.ink
}

export type DocKind = 'slip' | 'invoice' | 'credit_note'
const TITLE: Record<DocKind, string> = { slip: 'Packing slip', invoice: 'Tax invoice', credit_note: 'Credit note' }

/** "Kesar Studio Tax invoice KS-26-27-00001.pdf"; many: "Kesar Studio Packing slips 2026-11-08 (12).pdf". */
export function documentFileName(kind: DocKind, shop: string, refs: string[], day: string, invoiceTitle?: string): string {
  const title = kind === 'invoice' && invoiceTitle ? invoiceTitle : TITLE[kind]
  const name = refs.length === 1 ? `${shop} ${title} ${refs[0]}` : `${shop} ${title.replace(/(slip|invoice|note)$/i, '$1s')} ${day} (${refs.length})`
  return `${name.replace(/[/\\]/g, '-').replace(/[\u0000-\u001f"]/g, '').replace(/\s+/g, ' ').trim()}.pdf`
}

/** Content-Disposition for a download: an ASCII name for every browser, the real name for the ones that read it. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim() || 'document.pdf'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
