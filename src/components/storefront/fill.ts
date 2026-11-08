/** "Ships in {d} days" + { d: 2 } → "Ships in 2 days". A missing name stays as written, so a slip shows. Shared by
 *  the server words (words.ts) and the islands that receive templates as props. No words live here. */
export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m))
