// =============================================================================
// FILE: src/domains/analytics/device.ts — what a visit's User-Agent says (A·2, plan docs/plans/2026-11-11-guardrails-infra-a2.md
// A2·2): a bot or not, the device, the browser, and the in-app browser shops care most about (Instagram, Facebook,
// WhatsApp). Read on the server from the request, so the beacon sends none of it. Coarse on purpose: the console shows
// shares, never a fingerprint. Pure: no I/O.
// =============================================================================

export type Device = 'phone' | 'tablet' | 'computer'
export type Browser = 'chrome' | 'safari' | 'firefox' | 'samsung' | 'edge' | 'opera' | 'other'
export type InApp = 'instagram' | 'facebook' | 'whatsapp' | ''
export type Agent = { device: Device; browser: Browser; inApp: InApp }

/** Crawlers, link previews, monitors, headless browsers and HTTP libraries: none is a shopper. A UA we can't read is
 * treated as a bot too (a browser always sends one). */
// Not 'pinterest', 'telegram' or 'linkedin': their in-app browsers carry real shoppers (their crawlers say bot/ or don't
// start with Mozilla/), and not a bare 'bot' (the Cubot phone).
const BOT = /\bbot\b|bot\/|crawl|spider|slurp|preview|prerender|headless|lighthouse|pagespeed|inspectiontool|google-read-aloud|mediapartners|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|telegrambot|discordbot|skypeuripreview|embedly|quora link|vkshare|monitor|uptime|pingdom|datadog|checkly|python|curl|wget|httpclient|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|scrapy|phantom|selenium|playwright|puppeteer|electron/i

export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20 || !/^Mozilla\//.test(ua)) return true
  return BOT.test(ua)
}

export function agentOf(ua: string): Agent {
  const inApp: InApp = /Instagram/.test(ua) ? 'instagram' : /FBAN|FBAV|FB_IAB|FBIOS|\[FB/.test(ua) ? 'facebook' : /WhatsApp/.test(ua) ? 'whatsapp' : ''
  const tablet = /iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
  const phone = !tablet && /Mobi|iPhone|iPod|Android/.test(ua)
  const device: Device = tablet ? 'tablet' : phone ? 'phone' : 'computer'
  const browser: Browser =
    /SamsungBrowser/.test(ua) ? 'samsung'
      : /Edg(e|A|iOS)?\//.test(ua) ? 'edge'
        : /OPR\/|Opera|OPiOS/.test(ua) ? 'opera'
          : /Firefox\/|FxiOS/.test(ua) ? 'firefox'
            : /Chrome\/|CriOS|Chromium/.test(ua) ? 'chrome'
              : /Safari\//.test(ua) && /Version\/|iPhone|iPad|Macintosh/.test(ua) ? 'safari'
                : /AppleWebKit/.test(ua) && /iPhone|iPad/.test(ua) ? 'safari' // iOS in-app views: WebKit, no Safari/ token
                  : 'other'
  return { device, browser, inApp }
}
