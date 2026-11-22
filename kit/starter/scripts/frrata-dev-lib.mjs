// `npm run frrata`'s pure parts (tested in Frrata's src/domains/storefront-api/__tests__/kit.test.ts): where the store
// and Frrata are, and what each answer of Frrata's device sign-in means. No I/O here; scripts/frrata-dev.mjs runs it.

/** KEY=value lines of an env file (.env.local), comments and blank lines skipped, quotes taken off. */
export function envFile(text) {
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/** The store to sign in to: the command's argument, else FRRATA_STORE (the site's .env.local). Null: not a store's name. */
export function storeOf(argv, env) {
  const s = (argv.find((a) => !a.startsWith('-')) ?? env.FRRATA_STORE ?? '').trim().toLowerCase()
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s) ? s : null
}

/** Frrata's console, where the sign-in starts: FRRATA_CONSOLE_ORIGIN (https only, or http on localhost), else Frrata's. */
export function consoleOf(env) {
  const o = (env.FRRATA_CONSOLE_ORIGIN ?? '').trim().replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o) || /^http:\/\/localhost(:\d+)?$/i.test(o) ? o : 'https://frata.vercel.app'
}

/** A server's words as plain text for a terminal: control characters (escape codes included) taken out. */
export function plain(text) {
  return String(text ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '')
}

/**
 * One poll's answer as the next step: keep waiting (`wait`, after `seconds`), the key (`key`), or stop with Frrata's
 * own words (`stop`). A limit (429) waits longer and says so once; anything else Frrata refuses stops.
 */
export function pollStep(status, body, interval) {
  if (status === 202) return { next: 'wait', seconds: interval }
  if (status === 200 && typeof body?.key === 'string' && body.key.startsWith('frs_build_')) return { next: 'key', key: body.key }
  if (status === 429) return { next: 'wait', seconds: Math.max(interval * 6, 30), say: body?.message }
  return { next: 'stop', say: body?.message ?? 'Frrata could not answer. Try again in a minute.' }
}
