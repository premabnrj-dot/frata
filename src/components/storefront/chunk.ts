/** A lazily loaded chunk, fetched once and kept; a load that failed (a weak connection) is tried again on the next call,
 *  never kept as a failure (webpack asks for a failed chunk afresh). The bag drawer's lines, checkout's offers. */
export function chunk<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null
  return () => (p ??= load().catch((e: unknown) => { p = null; throw e }))
}
