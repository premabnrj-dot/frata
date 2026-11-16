// =============================================================================
// FILE: scripts/lib/doc-refs.mjs — which repo files does each living doc name? Read from the docs themselves.
// Shared by check:docs (a doc naming a file that is gone) and, from G2 of the practices plan, the pre-bash hook's doc
// drift (a commit changing a file a doc names, without the doc). There is no hand-written map of "this doc covers these
// files": naming a file in
// backticks IS putting it in scope, so the map cannot go stale (after Ekatan's scripts/lib/doc-refs.mjs).
//
// Living docs describe the code as it is: CLAUDE.md, .claude/**/*.md, docs/setup.md, docs/runbooks/*, e2e/README.md.
// Specs, plans, ADRs and research are history; they record what was planned and are left as written.
// =============================================================================

export const isLivingDoc = (f) =>
  f === 'CLAUDE.md' || /^\.claude\/.*\.md$/.test(f) || f === 'docs/setup.md' || /^docs\/runbooks\/[^/]+\.md$/.test(f) ||
  f === 'e2e/README.md'

const ROOTS = '(?:src|scripts|drizzle|drizzle-analytics|e2e|docs|\\.claude|public|kit)'
const REF = new RegExp('`(' + ROOTS + '\\/[^`\\s{}]+?)(?::\\d+(?:[-–]\\d+)?)?`', 'g')
// A placeholder, not a path: NN or NNNN numbering, <name>, a glob, an ellipsis.
export const isPlaceholder = (p) => /\bN{2,4}\b|<|>|\*|…|\.\.\.|\$\{/.test(p)

// Every backticked repo path in a doc, with its line number (1-based). Comment lines of a script are not docs.
export function namedPaths(text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(REF)) {
      const p = m[1].replace(/[.,;:)]+$/, '')
      if (!isPlaceholder(p)) out.push({ path: p, line: i + 1 })
    }
  })
  return out
}

// A skill's or agent's metadata.covers globs as RegExps.
export const globToRegExp = (g) =>
  new RegExp('^' + g.replace(/[.+^$()|[\]]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$')

// doc → Map(file → [lines]) for every living doc: the tracked files it names exactly, and those its `covers:` globs match
// (line 0: the front-matter). tracked: `git ls-files`; read: (path) => text.
export function coverage(tracked, read) {
  const files = new Set(tracked)
  const out = new Map()
  for (const doc of tracked.filter(isLivingDoc)) {
    let text
    try { text = read(doc) } catch { continue }
    const hits = new Map()
    for (const { path, line } of namedPaths(text)) if (files.has(path) && path !== doc) hits.set(path, [...(hits.get(path) ?? []), line])
    const covers = text.match(/^\s*covers:\s*\[([^\]]*)\]/m)?.[1]
    if (covers) {
      const globs = [...covers.matchAll(/"([^"]+)"/g)].map((m) => globToRegExp(m[1]))
      for (const f of tracked) if (f !== doc && !hits.has(f) && globs.some((r) => r.test(f))) hits.set(f, [0])
    }
    if (hits.size) out.set(doc, hits)
  }
  return out
}
