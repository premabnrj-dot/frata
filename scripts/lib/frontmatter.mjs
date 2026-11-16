// =============================================================================
// FILE: scripts/lib/frontmatter.mjs — reads the front-matter of a skill or agent file (check:skills, check:docs,
// the pre-bash hook). The subset Frrata's files use: `key: value` scalars, inline arrays (`[a, "b"]`), and one level
// of nested map (`metadata:` with two-space indented keys). No dependency: a YAML library for eight keys is not worth
// its install. A file with no front-matter returns data null and the whole text as body.
// =============================================================================

const scalar = (raw) => {
  const v = raw.trim()
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  return v.replace(/^["'](.*)["']$/, '$1')
}

export function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: null, body: text, errors: [] }
  const data = {}
  const errors = []
  let parent = null
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const nested = line.match(/^ {2}([A-Za-z_][\w-]*):\s*(.*)$/)
    if (nested && parent) { data[parent][nested[1]] = scalar(nested[2]); continue }
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!top) { errors.push(`front-matter line not understood: ${line.slice(0, 60)}`); continue }
    if (top[2].trim() === '') { data[top[1]] = {}; parent = top[1] } else { data[top[1]] = scalar(top[2]); parent = null }
  }
  return { data, body: m[2], errors }
}
