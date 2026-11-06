// =============================================================================
// FILE: lib/http/timeout.ts
//
// EVERY CALL THAT LEAVES THE SERVER HAS A DEADLINE (ported from Ekatan).
//
// A call that never answers holds a function until Vercel kills it. Ekatan had
// eleven requests in a month run to the 300 s limit because Storage, Meta and
// file downloads were bare fetch() calls. Razorpay, Shiprocket, Meta and Google
// all go through here. `scripts/check-fetch.mjs` fails a bare fetch( in server code.
//
// An API answers in well under a second, so 15 s is a fault; a file gets a minute.
// =============================================================================

export const API_TIMEOUT_MS = 15_000
export const FILE_TIMEOUT_MS = 60_000

/**
 * `init` with a signal that fires after `ms`, keeping any signal it had.
 *
 * ⚠️ BUILT FROM AbortController AND setTimeout ONLY. The middleware runs on the
 * Edge runtime, where AbortSignal.any is not guaranteed; a missing function
 * there would fail every request to the site, not one slow call.
 */
export function withDeadline(init: RequestInit | undefined, ms: number): RequestInit {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms} ms`)), ms)
  // Node: a pending deadline must not keep a finished function alive.
  ;(timer as { unref?: () => void }).unref?.()
  const own = init?.signal
  if (own) {
    if (own.aborted) controller.abort(own.reason)
    else own.addEventListener('abort', () => controller.abort(own.reason), { once: true })
  }
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return { ...init, signal: controller.signal }
}

/** fetch() that gives up after `ms`. */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, ms: number = API_TIMEOUT_MS): Promise<Response> {
  return fetch(input, withDeadline(init, ms))
}

/** A fetch to hand a client library (Supabase's `global.fetch`). */
export function timeoutFetch(ms: number = API_TIMEOUT_MS): typeof fetch {
  return (input, init) => fetch(input, withDeadline(init, ms))
}

/**
 * The fetch for a server-side Supabase client: Auth and Storage API calls
 * (sign in, sign a URL, list) get the API deadline; moving a file's bytes
 * (an upload or a download under /storage/v1/object/, not /object/sign/)
 * gets the file one — a product photo can be megabytes.
 */
export function supabaseFetch(): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const moving = url.includes('/storage/v1/object/') && !url.includes('/storage/v1/object/sign/')
    return fetch(input, withDeadline(init, moving ? FILE_TIMEOUT_MS : API_TIMEOUT_MS))
  }
}
