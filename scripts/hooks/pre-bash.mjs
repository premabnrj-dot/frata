#!/usr/bin/env node
// =============================================================================
// FILE: scripts/hooks/pre-bash.mjs — the one Claude Code PreToolUse hook on Bash (.claude/settings.json).
//
// Before a `git commit` in this repo:
//   gates   runs `npm run gates` (the gate chain of npm test, ~6 s; vitest and typecheck stay manual) and DENIES the
//           commit on a failure, with the failing lines. `Gates: skipped — <why>` in the message lets it through (a red
//           main that is not this commit's doing); the line stays in history.
//   docs    names each living doc that names a file the commit changes, while the doc is not in the commit
//           (scripts/lib/doc-refs.mjs). A WARNING to the agent, not a deny: replayed over the last 300 commits it would
//           have stopped 38%, over the plan's 25% line (practices plan, task 12). `Docs: unaffected — <why>` silences it.
// Before a `git push`: DENIES a push that forces, deletes or mirrors `main` (--force*, -f, +main, +HEAD on main, :main,
// --delete, --mirror). Not caught, and accepted: git aliases, a remote configured to force, `bash -c '…'`, backticks.
// This is a guard against an agent's mistake; the lock on main is GitHub's branch protection (the owner's setting).
//
// ⚠️ IT NEVER RUNS THE COMMAND'S TEXT. It runs before the person approves the call, so the command is parsed in JS
// (a tokenizer, heredoc bodies cut out first) and git is called with argv, never a shell. The only outputs are a deny
// or nothing; it never answers "allow", which would skip the permission prompt for whatever else the command chains.
// ⚠️ IT ONLY ACTS IN THIS REPO: the command's git directory must be the project's (or one of its .claude/worktrees),
// so a commit in another clone never runs that clone's scripts.
// ⚠️ IT NEVER BREAKS A COMMIT BY FAILING: any error of its own exits 0 silently. CI's `npm test` is the real gate.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { coverage } from '../lib/doc-refs.mjs'

const REASON = '[ \\t]*[—–:-][ \\t]*(\\S[^\\n]{7,})'
export const docsAnswered = (text) => new RegExp('Docs:\\s*unaffected' + REASON, 'i').test(text)
export const gatesSkipped = (text) => new RegExp('Gates:\\s*skipped' + REASON, 'i').test(text)

// The command split into simple commands (arrays of words), heredoc bodies removed and kept apart as text.
export function parse(command) {
  const heredocs = []
  const src = command.replace(/(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (_, _q, _d, rest, body) => {
    heredocs.push(body)
    return `__HEREDOC_${heredocs.length - 1}__${rest}`
  })
  const segments = []
  let words = []
  let word = ''
  let inWord = false
  const end = () => { if (inWord) words.push(word); word = ''; inWord = false }
  const cut = () => { end(); if (words.length) segments.push(words); words = [] }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "'") { const j = src.indexOf("'", i + 1); word += src.slice(i + 1, j < 0 ? src.length : j); inWord = true; i = j < 0 ? src.length : j; continue }
    if (c === '"') {
      let j = i + 1
      let depth = 0
      for (; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue }
        if (src[j] === '$' && src[j + 1] === '(') { depth++; j++; continue }
        if (src[j] === ')' && depth) { depth--; continue }
        if (src[j] === '"' && !depth) break
      }
      word += src.slice(i + 1, j).replace(/\\(["\\$`])/g, '$1'); inWord = true; i = j; continue
    }
    if (c === '\\' && i + 1 < src.length) { word += src[++i]; inWord = true; continue }
    if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')') { cut(); continue }
    if (c === ' ' || c === '\t') { end(); continue }
    word += c; inWord = true
  }
  cut()
  return { segments, heredocs }
}

// git's subcommand and its arguments, past `-C dir` / `-c k=v` and other options; null when the words aren't git.
export function gitCall(words) {
  let i = 0
  // VAR=value git …, `command git`, `then git`, `{ git`, /usr/bin/git
  while (i < words.length && (/^[A-Za-z_]\w*=/.test(words[i]) || ['command', 'exec', 'then', 'do', 'else', '{', '!', 'time'].includes(words[i]))) i++
  if (!words[i] || basename(words[i]) !== 'git') return null
  let dir = null
  i++
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') { dir = words[i + 1]; i += 2 } else if (words[i] === '-c') i += 2; else i++
  }
  return { sub: words[i], args: words.slice(i + 1), dir }
}

// Does this push force, delete or mirror main? args: what follows `git push`; branch: the current branch.
export function forcesMain(args, branch) {
  // Options that take a value: the value is not a remote or a refspec.
  const VALUED = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])
  const flags = []
  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (VALUED.has(args[i])) { i++; continue }
    ;(args[i].startsWith('-') ? flags : positional).push(args[i])
  }
  const force = flags.some((f) => /^(--force(-with-lease|-if-includes)?(=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/.test(f))
  const del = flags.some((f) => f === '--delete' || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(f))
  if (flags.includes('--mirror')) return true
  const refspecs = positional.slice(1)
  const dest = (r) => {
    const d = r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '')
    return (d === 'HEAD' || d === '@') && branch === 'main' ? 'main' : d
  }
  const namesMain = refspecs.some((r) => dest(r) === 'main')
  if (refspecs.some((r) => r.startsWith('+') && dest(r) === 'main')) return true
  if (refspecs.some((r) => /^:(refs\/heads\/)?main$/.test(r))) return true
  if (del && refspecs.some((r) => dest(r) === 'main')) return true
  return force && (namesMain || (refspecs.length === 0 && branch === 'main'))
}

const git = (cwd, args) => {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`)
  return r.stdout
}
const lines = (s) => s.split(/[\n\0]/).map((x) => x.trim()).filter(Boolean)

export function decide(input, project) {
  const command = String(input?.tool_input?.command ?? '')
  if (!/\bgit\b/.test(command) || !/\b(commit|push)\b/.test(command)) return null
  const { segments, heredocs } = parse(command)
  let cwd = input?.cwd || project
  const calls = []
  for (const words of segments) {
    if (words[0] === 'cd' && words[1]) { if (!/^[~$]/.test(words[1])) cwd = isAbsolute(words[1]) ? words[1] : resolve(cwd, words[1]); continue }
    const call = gitCall(words)
    if (call) calls.push({ ...call, cwd: call.dir ? resolve(cwd, call.dir) : cwd })
  }
  // This repo, or one of its own worktrees under .claude/worktrees (same git common dir: a clone dropped there is not).
  const real = (p) => realpathSync(p)
  const common = real(resolve(project, git(project, ['rev-parse', '--git-common-dir']).trim()))
  const ours = (dir) => {
    const top = real(git(dir, ['rev-parse', '--show-toplevel']).trim())
    if (top === project) return true
    return top.startsWith(join(project, '.claude', 'worktrees') + '/') && real(resolve(dir, git(dir, ['rev-parse', '--git-common-dir']).trim())) === common
  }

  for (const c of calls.filter((x) => x.sub === 'push')) {
    if (!ours(c.cwd)) continue
    const branch = git(c.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    if (forcesMain(c.args, branch)) {
      return { deny: 'This push would force, delete or mirror main, which is production (CLAUDE.md "Deploying"). Push a fast-forward instead; merge origin/main first if it is behind.' }
    }
  }

  const commit = calls.find((x) => x.sub === 'commit')
  if (!commit || !ours(commit.cwd)) return null
  const top = git(commit.cwd, ['rev-parse', '--show-toplevel']).trim()
  // The message, wherever it is: -m text, a heredoc, or -F <file>.
  let message = [command, ...heredocs].join('\n')
  const fi = commit.args.findIndex((a) => a === '-F' || a === '--file' || a.startsWith('--file='))
  const fpath = fi < 0 ? null : commit.args[fi].startsWith('--file=') ? commit.args[fi].slice(7) : commit.args[fi + 1]
  if (fpath) {
    const f = resolve(commit.cwd, fpath)
    try { const st = statSync(f); if (st.isFile() && st.size < 64 * 1024) message += '\n' + readFileSync(f, 'utf8') } catch { /* no file: no message */ }
  }

  const out = {}
  if (!gatesSkipped(message)) {
    const r = spawnSync('npm', ['run', '-s', 'gates'], { cwd: top, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120_000 })
    if (r.status !== 0 && r.status !== null) {
      const tail = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.trim() && !/^\s*at /.test(l)).slice(-15).join('\n')
      out.deny = `npm run gates failed, so this commit was stopped (CLAUDE.md "Before you commit"):\n\n${tail}\n\nThe gates read the working tree, unstaged changes included. Fix it and commit again. If main itself is red and it is not this commit's doing, add "Gates: skipped — <why>" to the message.`
      return out
    }
  }

  if (!docsAnswered(message) && !commit.args.includes('--amend')) {
    const changed = new Set(lines(git(top, ['diff', '--cached', '--name-only', '-z', '--no-ext-diff'])))
    const addsAll = segments.some((w) => gitCall(w)?.sub === 'add') || commit.args.some((a) => a === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a))
    if (addsAll) {
      for (const f of lines(git(top, ['diff', '--name-only', '-z', '--no-ext-diff']))) changed.add(f)
      for (const f of lines(git(top, ['ls-files', '--others', '--exclude-standard', '-z']))) changed.add(f)
    }
    const findings = []
    for (const [doc, files] of coverage(lines(git(top, ['ls-files', '-z'])), (f) => readFileSync(join(top, f), 'utf8'))) {
      if (changed.has(doc)) continue
      const hits = [...files].filter(([f]) => changed.has(f))
      if (hits.length) findings.push(`  ${doc}: ${hits.slice(0, 4).map(([f, at]) => `${f}${at[0] ? ` (line ${at.slice(0, 3).join(', ')})` : ' (covers)'}`).join('; ')}`)
    }
    if (findings.length) {
      out.context = ['This commit changes files that a living doc names, and the doc is not in the commit:', ...findings.slice(0, 12),
        'The commit goes ahead. Read each passage: if it is now wrong, fix the doc in the next commit; if it is still right,',
        'say so next time with "Docs: unaffected — <why>" in the message.'].join('\n')
    }
  }
  return out
}

function main() {
  try {
    const project = realpathSync(resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd()))
    const result = decide(JSON.parse(readFileSync(0, 'utf8')), project)
    if (result?.deny) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.deny } }))
    } else if (result?.context) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: result.context } }))
    }
  } catch { /* never break a commit on the hook's own error */ }
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
