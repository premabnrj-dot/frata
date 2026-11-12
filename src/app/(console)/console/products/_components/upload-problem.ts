/**
 * What went wrong with one photo's upload, in words (the storage service's own messages are for us, not the merchant).
 * Apart from upload-photos.ts, which loads only when someone adds photos.
 */
export function uploadProblem(name: string, e: unknown): string {
  const m = e instanceof Error ? e.message : ''
  if (/private/i.test(m)) return 'Photo storage is set to private, so shoppers could not see these photos. Frrata support needs to switch it to a public store.'
  if (/network|fetch|failed to fetch/i.test(m)) return `${name} did not upload: the connection dropped. Try again.`
  if (m.startsWith('Vercel Blob')) return `${name} was refused by photo storage. Try again, or send us this: ${m.replace(/^Vercel Blob:\s*/, '').slice(0, 120)}`
  return m || `${name} could not be uploaded.`
}
