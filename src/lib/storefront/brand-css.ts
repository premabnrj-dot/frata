// =============================================================================
// FILE: src/lib/storefront/brand-css.ts — THE BRAND FRAME'S OWN RULES (one-address plan P2·3; owner-approved
// mockup docs/mockups/2026-11-16-p2-checkout.html, its .s-* rules). Sent inline by BrandFrame, so only a code-site
// store's checkout, bag-link, order and policy pages carry them: the shop's shared sheet (check:storefront-build, 15.9
// kB) and every theme shop stay as they were. A constant: nothing a merchant or shopper typed is ever in it. Colours
// are the store's tokens, which BrandFrame sets from the brand record. Unlayered, so it wins over the views' utilities. Its breakpoint is the frame's own width (a container query), so the
// console's preview at 390 px lays out as a phone inside a wide page, and a live page as before (its frame is the page).
// Kept outside the folders the shop's Tailwind scans (src/app/shop.css @source): its words (container, flex, grid) would
// otherwise become utilities in the shared sheet.
// =============================================================================

export const BRAND_CSS = `
[data-brand]{font-family:var(--store-body);container:brand/inline-size}
[data-brand] :focus-visible{outline:2px solid var(--store-ink);outline-offset:2px}
[data-brand] .bf-hd{border-bottom:1px solid var(--store-line);background:var(--store-paper)}
[data-brand] .bf-hw{position:relative;margin:0 auto;display:flex;height:56px;max-width:1200px;align-items:center;gap:12px;padding:0 16px}
[data-brand] .bf-hw.c{justify-content:center}
[data-brand] .bf-home{display:flex;align-items:center;color:var(--store-ink)}
[data-brand] .bf-logo{display:block;height:34px;width:auto;max-width:200px;object-fit:contain}
[data-brand] .bf-name{font:400 20px/1 var(--store-display)}
[data-brand] .bf-sp{flex:1}
[data-brand] .bf-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:14px;text-decoration:underline;text-decoration-color:var(--store-edge);text-underline-offset:4px}
[data-brand] .bf-hw.c .bf-back{position:absolute;left:16px;text-decoration:none}
[data-brand] .bf-hw.c .bf-back span{display:none}
[data-brand] .bf-ic{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
[data-brand] .bf-main{display:flex;flex:1;flex-direction:column}
[data-brand] .bf-ft{border-top:1px solid var(--store-line);background:var(--store-chip);font-size:14px;line-height:21px}
[data-brand] .bf-fw{margin:0 auto;display:flex;flex-direction:column;gap:16px;max-width:1200px;padding:24px 16px 28px}
[data-brand] .bf-ft ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 20px}
[data-brand] .bf-ft ul.two{display:grid;grid-template-columns:repeat(3,max-content)}
[data-brand] .bf-ft li a{display:inline-flex;min-height:32px;align-items:center}
[data-brand] .bf-ft dl{margin:0;display:grid;gap:10px}[data-brand] .bf-ft dt{font-weight:600}[data-brand] .bf-ft dd{margin:0}
[data-brand] .bf-trust{margin:24px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;padding:16px;list-style:none;background:var(--store-chip);border-radius:var(--store-radius);font-size:14px;line-height:20px}
[data-brand] .bf-trust li{display:flex;gap:8px;align-items:flex-start}
[data-brand] [data-online="0"] [data-trust-key="secure"]{display:none}
[data-brand] .ck-form,[data-brand] .ck-col{max-width:560px}
[data-brand] .ck-h1{font:400 32px/38px var(--store-display);letter-spacing:-.008em}
[data-brand] .ck-h1-sm{font:400 28px/34px var(--store-display)}
[data-brand] .ck-sect{font-size:13px;line-height:16px;letter-spacing:.08em;margin:28px 0 12px}
[data-brand] .ck-label{font-size:14px;line-height:20px;font-weight:600}
[data-brand] .ck-help{font-size:14px;line-height:20px}
[data-brand] .ck-thanks{margin-top:-8px;font:italic 400 20px/28px var(--store-display)}
[data-brand] .store-field{height:var(--store-field);border-color:var(--store-edge)}
[data-brand] .store-pay{border-color:var(--store-edge);padding:14px}
[data-brand] .store-buy{height:52px;font-weight:600}
[data-brand] .ck-go{min-height:52px;padding:0 24px;font-size:16px;font-weight:600}
[data-brand] .ck-lines{list-style:none;margin:0;padding:0;border-top:1px solid var(--store-line)}
[data-brand] .ck-line{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:4px 12px;padding:14px 0;border-bottom:1px solid var(--store-line);align-items:start}
[data-brand] .ck-ph{display:block;width:56px;height:84px;grid-row:span 2;overflow:hidden;background:var(--store-chip)}
[data-brand] .ck-ph img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 20%}
[data-brand] .ck-tt{font-size:15px;line-height:21px}[data-brand] .ck-tt small{display:block;color:var(--store-sub);font-size:14px;line-height:20px}
[data-brand] .ck-pr{font-weight:600;font-variant-numeric:tabular-nums lining-nums;text-align:right;white-space:nowrap}
[data-brand] .ck-ctl{grid-column:2/-1;display:flex;flex-wrap:wrap;align-items:center;gap:12px}
[data-brand] .ck-line.dim .ck-ph img{opacity:.5}[data-brand] .ck-line.dim .ck-tt{color:var(--store-sub)}
[data-brand] .ck-step{display:inline-flex;align-items:center;border:1px solid var(--store-edge);border-radius:var(--store-radius)}
[data-brand] .ck-step button{display:grid;place-items:center;width:44px;height:44px;border:0;background:none;color:var(--store-ink);cursor:pointer}
[data-brand] .ck-step button:disabled{color:var(--store-edge);cursor:default}
[data-brand] .ck-step span{min-width:24px;text-align:center;font-variant-numeric:tabular-nums}
[data-brand] .ck-link{min-height:44px;padding:0;border:0;background:none;font:inherit;font-size:14px;color:var(--store-ink);text-decoration:underline;text-decoration-color:var(--store-edge);text-underline-offset:4px;cursor:pointer}
[data-brand] .ck-gone{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid var(--store-line);font-size:14px;color:var(--store-sub)}
[data-brand] .ck-gone .ck-link{min-height:24px}
[data-brand] .ck-err{display:flex;gap:6px;margin:0;font-size:14px;line-height:20px;color:var(--store-bad)}
[data-brand] .ck-note{grid-column:2/-1;margin:0;font-size:14px;line-height:20px;color:var(--store-warn)}
[data-brand] .ck-ic-sm{display:block;width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
[data-brand] .ck-err .ck-ic-sm,[data-brand] .ck-fe .ck-ic-sm{margin-top:2px}
[data-brand] .ck-fe{display:flex;gap:6px}
[data-brand] .ck-msg{display:flex;gap:10px;font-size:15px;line-height:22px}[data-brand] .ck-msg .ck-ic-sm{width:20px;height:20px;margin-top:1px}
@container brand (min-width:640px){
[data-brand] .bf-hw{height:72px;padding:0 40px}[data-brand] .bf-hw.c .bf-back{left:40px}[data-brand] .bf-hw.c .bf-back span{display:inline}[data-brand] .bf-logo{height:40px}
[data-brand] .bf-fw{padding:28px 40px 32px}[data-brand] .bf-ft dl{grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
[data-brand] .bf-trust{grid-template-columns:repeat(4,minmax(0,1fr))}
[data-brand] .ck-h1{font-size:44px;line-height:50px}
}`.replace(/\n/g, '')
