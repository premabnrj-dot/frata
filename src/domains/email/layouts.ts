import { html, lines, safeColour, safeHref, type Html } from './html'

// =============================================================================
// FILE: src/domains/email/layouts.ts — THE TWO EMAIL LAYOUTS (spec § 1, mockup v2 screens 4–5 and 8). Pure: data in,
// { html, text } out. The shop's layout carries the shop's logo, colour, name and legal footer — no Frrata mark
// anywhere. Frrata's carries the wordmark and the rani thread. Tables and inline styles (mail clients); a light plate
// under the logo so it reads in dark mode; a plain-text part from the same data; ≤ 60 kB (a test checks).
// =============================================================================

export type Rendered = { html: string; text: string }

export type OrderBlock = {
  number: string
  date: string
  items: { title: string; detail: string }[]
  total: string
  /** "Pay ₹2,490 on delivery" or "Paid online"; null for none. */
  payLine: string | null
}

export type ShopEmail = {
  preview: string
  shop: { name: string; logoUrl: string | null; accent: string | null }
  heading: string
  message: string
  button: { label: string; href: string } | null
  order: OrderBlock | null
  footer: { legalName: string; address: string; grievance: string | null; supportEmail: string; newDropsHref: string | null }
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function shell(preview: string, body: Html, bg: string): string {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${preview}</title></head>
<body style="margin:0;padding:0;background:${bg};"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;font-family:${FONT};color:#1C1917;">${body}</table>
</td></tr></table></body></html>`.value
}

function orderHtml(o: OrderBlock): Html {
  return html`<tr><td style="padding:0 28px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E1DA;border-radius:6px;">
<tr><td style="padding:12px 14px;font-size:14px;"><b>${o.number}</b></td><td align="right" style="padding:12px 14px;font-size:13px;color:#6B5E55;">${o.date}</td></tr>
${o.items.map((i) => html`<tr><td colspan="2" style="padding:4px 14px;font-size:14px;">${i.title}<br><span style="color:#6B5E55;font-size:13px;">${i.detail}</span></td></tr>`)}
<tr><td style="padding:10px 14px;font-size:14px;border-top:1px solid #E7E1DA;">Total</td><td align="right" style="padding:10px 14px;font-size:14px;border-top:1px solid #E7E1DA;"><b>${o.total}</b></td></tr>
${o.payLine ? html`<tr><td colspan="2" style="padding:0 14px 12px;font-size:13px;color:#6B5E55;">${o.payLine}</td></tr>` : null}
</table></td></tr>`
}

/** A shop's email to its shopper. */
export function shopEmail(e: ShopEmail): Rendered {
  const accent = safeColour(e.shop.accent)
  const logo = e.shop.logoUrl ? safeHref(e.shop.logoUrl) : ''
  const href = e.button ? safeHref(e.button.href) : ''
  const drops = e.footer.newDropsHref ? safeHref(e.footer.newDropsHref) : ''
  const body = html`
<tr><td align="center" style="padding:24px 28px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:6px;padding:6px 12px;">
${logo ? html`<img src="${logo}" alt="${e.shop.name}" height="40" style="display:block;height:40px;max-width:200px;border:0;">` : html`<span style="font-size:20px;font-weight:600;letter-spacing:.04em;">${e.shop.name}</span>`}
</td></tr></table></td></tr>
<tr><td style="padding:12px 28px 4px;font-size:22px;line-height:1.25;font-weight:600;">${e.heading}</td></tr>
<tr><td style="padding:4px 28px 16px;font-size:15px;line-height:1.55;">${lines(e.message)}</td></tr>
${e.order ? orderHtml(e.order) : null}
${href && e.button ? html`<tr><td style="padding:12px 28px 24px;"><a href="${href}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:4px;">${e.button.label}</a></td></tr>` : null}
<tr><td style="padding:14px 28px 22px;border-top:1px solid #E7E1DA;font-size:12px;line-height:1.5;color:#6B5E55;">
Questions? Reply to this email or write to ${e.footer.supportEmail}.<br>
${e.footer.legalName} · ${e.footer.address}${e.footer.grievance ? html`<br>Grievance officer: ${e.footer.grievance}` : null}
${drops ? html`<br><a href="${drops}" style="color:#6B5E55;">Email me new drops</a>` : null}
</td></tr>`
  const text = [
    e.shop.name, '', e.heading, '', e.message, '',
    ...(e.order ? [`${e.order.number} · ${e.order.date}`, ...e.order.items.map((i) => `${i.title} (${i.detail})`), `Total ${e.order.total}`, ...(e.order.payLine ? [e.order.payLine] : []), ''] : []),
    ...(href && e.button ? [`${e.button.label}: ${href}`, ''] : []),
    `Questions? Reply to this email or write to ${e.footer.supportEmail}.`,
    `${e.footer.legalName} · ${e.footer.address}`,
    ...(e.footer.grievance ? [`Grievance officer: ${e.footer.grievance}`] : []),
    ...(drops ? [`Email me new drops: ${drops}`] : []),
  ].join('\n')
  return { html: shell(e.preview, body, '#F7F2EC'), text }
}

export type FrrataEmail = {
  preview: string
  heading: string
  message: string
  button: { label: string; href: string } | null
  footer: string
}

/** Frrata's email to a merchant, staff member or partner. */
export function frrataEmail(e: FrrataEmail): Rendered {
  const href = e.button ? safeHref(e.button.href) : ''
  const body = html`
<tr><td style="padding:20px 28px 14px;border-bottom:2px solid #D61F69;font-size:20px;font-weight:700;letter-spacing:-.01em;">frrata<span style="color:#D61F69;">.</span></td></tr>
<tr><td style="padding:20px 28px 6px;font-size:18px;font-weight:600;line-height:1.3;">${e.heading}</td></tr>
<tr><td style="padding:4px 28px 16px;font-size:15px;line-height:1.55;">${lines(e.message)}</td></tr>
${href && e.button ? html`<tr><td style="padding:4px 28px 22px;"><a href="${href}" style="display:inline-block;background:#1C1917;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px;">${e.button.label}</a></td></tr>` : null}
<tr><td style="padding:12px 28px 18px;border-top:1px solid #E7E4E0;font-size:12px;color:#5F5A55;">${e.footer}</td></tr>`
  const text = ['Frrata', '', e.heading, '', e.message, '', ...(href && e.button ? [`${e.button.label}: ${href}`, ''] : []), e.footer].join('\n')
  return { html: shell(e.preview, body, '#FAFAF9'), text }
}

/** Mail clients clip at 102 kB (Gmail); ours stay under 60 kB (spec § Design). */
export const MAX_EMAIL_BYTES = 60_000
