/** A request body, refused past `max` bytes before it is all read (security S13). Null when too large. */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
