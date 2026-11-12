// Test-only preload for the app in the local end-to-end run (NODE_OPTIONS=--import, e2e/stack.mjs; never deployed):
// a server-side read of the e2e Blob store's public host goes to the stand-in store (e2e/fakes/blob.mjs) on
// E2E_BLOB_PORT instead of the internet. Every other request passes through untouched.
const HOST = 'e2e.public.blob.vercel-storage.com'
const port = process.env.E2E_BLOB_PORT
const real = globalThis.fetch
if (port && real) {
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    try {
      const u = new URL(url)
      if (u.host === HOST) return real(`http://127.0.0.1:${port}${u.pathname}`, init)
    } catch { /* not a URL: as it was */ }
    return real(input, init)
  }
}
