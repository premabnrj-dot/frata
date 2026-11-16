import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK = resolve(__dirname, '../hooks/pre-bash.mjs')

// A throwaway repo with a `gates` script that passes or fails, and a living doc naming src/a.ts.
function repo(gatesPass: boolean) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hook-')))
  const g = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@example.com')
  g('config', 'user.name', 't')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { gates: gatesPass ? 'node -e "0"' : 'node -e "console.log(\'check:x — 1 problem(s)\');process.exit(1)"' } }))
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1\n')
  writeFileSync(join(dir, 'CLAUDE.md'), 'The rule lives in `src/a.ts`.\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  return dir
}

const run = (dir: string, command: string) => {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command }, cwd: dir }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' })
  expect(r.status).toBe(0)
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null
}

describe('pre-bash hook: parsing', async () => {
  const { parse, gitCall, forcesMain } = await import('../hooks/pre-bash.mjs')
  it('splits chained commands, keeps quoted text whole and cuts heredoc bodies out', () => {
    const { segments, heredocs } = parse(`git add -A && git commit -m "$(cat <<'EOF'\nTitle "quoted" (x)\n\nDocs: unaffected — wording only\nEOF\n)"`)
    expect(segments[0]).toEqual(['git', 'add', '-A'])
    expect(gitCall(segments[1])?.sub).toBe('commit')
    expect(heredocs[0]).toContain('Docs: unaffected — wording only')
  })
  it('finds git past -C and -c, and ignores git inside an echo', () => {
    expect(gitCall(['git', '-C', 'x', '-c', 'a=b', 'commit', '-m', 'm'])).toEqual({ sub: 'commit', args: ['-m', 'm'], dir: 'x' })
    expect(gitCall(['echo', 'git commit'])).toBeNull()
    expect(gitCall(['command', '/usr/bin/git', 'push', '-f'])?.sub).toBe('push')
    expect(gitCall(['{', 'git', 'push'])?.sub).toBe('push')
  })
  it('a here-string is not taken for a heredoc that hides what follows', () => {
    const { segments } = parse('cat <<<EOF\ngit push -f origin main\nEOF')
    expect(segments.some((w: string[]) => gitCall(w)?.sub === 'push')).toBe(true)
  })
  it('refuses every way of forcing, deleting or mirroring main, and lets a fast-forward through', () => {
    for (const a of [['origin', 'main', '--force'], ['-f', 'origin', 'main'], ['origin', '+main'], ['origin', '+HEAD:main'], ['origin', ':main'],
      ['--delete', 'origin', 'main'], ['--mirror', 'origin'], ['--force-with-lease', 'origin', 'HEAD:refs/heads/main']]) {
      expect(forcesMain(a, 'feature')).toBe(true)
    }
    expect(forcesMain(['--force'], 'main')).toBe(true)
    expect(forcesMain(['origin', '+HEAD'], 'main')).toBe(true)
    expect(forcesMain(['origin', '+@'], 'main')).toBe(true)
    expect(forcesMain(['-f', '-o', 'ci.skip', 'origin'], 'main')).toBe(true)
    expect(forcesMain(['origin', 'main'], 'main')).toBe(false)
    expect(forcesMain(['origin', 'HEAD:main'], 'feature')).toBe(false)
    expect(forcesMain(['-u', 'origin', 'feature', '--force'], 'feature')).toBe(false)
  })
})

describe('pre-bash hook: decisions', () => {
  it('stays silent on a command that is not a commit or a push', () => {
    expect(run(repo(true), 'ls -la && git status')).toBeNull()
  })
  it('denies a commit when the gates fail, with their output; "Gates: skipped — why" lets it through', () => {
    const dir = repo(false)
    const out = run(dir, 'git commit -m "x"')
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toContain('check:x — 1 problem(s)')
    expect(run(dir, 'git commit -m "x" -m "Gates: skipped — main is red from another lane"')).toBeNull()
  })
  it('warns (never denies) when a changed file is named by a doc not in the commit, unless the message answers', () => {
    const dir = repo(true)
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 2\n')
    const out = run(dir, 'git add -A && git commit -m "change a"')
    expect(out.permissionDecision).toBeUndefined()
    expect(out.additionalContext).toContain('CLAUDE.md: src/a.ts (line 1)')
    expect(run(dir, 'git add -A && git commit -m "change a" -m "Docs: unaffected — the rule still holds"')).toBeNull()
    expect(run(dir, 'git add -A && git commit -m "change a" -m "Docs: unaffected"')?.additionalContext).toContain('CLAUDE.md')
  })
  it('never prints "allow", and never runs text from the command', () => {
    const dir = repo(true)
    const marker = join(dir, 'pwned')
    const out = run(dir, `git commit -m "$(touch ${marker})" -m \`touch ${marker}\``)
    expect(existsSync(marker)).toBe(false)
    expect(JSON.stringify(out ?? {})).not.toContain('allow')
  })
  it('does nothing for a commit in another repository', () => {
    const ours = repo(false)
    const other = repo(false)
    const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command: `git -C ${other} commit -m x` }, cwd: ours }), env: { ...process.env, CLAUDE_PROJECT_DIR: ours }, encoding: 'utf8' })
    expect(r.stdout).toBe('')
  })
  it('reads the message from -F, follows cd, skips the doc check on --amend', () => {
    const dir = repo(true)
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 3\n')
    writeFileSync(join(dir, 'msg.txt'), 'change a\n\nDocs: unaffected — the rule still holds\n')
    expect(run(dir, 'git add src/a.ts && git commit -F msg.txt')).toBeNull()
    expect(run(dir, `cd ${dir} && git add -A && git commit -m x`)?.additionalContext).toContain('CLAUDE.md')
    expect(run(dir, 'git commit --amend --no-edit')).toBeNull()
  })
  it('acts in a worktree of this repo under .claude/worktrees, not in a clone dropped there', () => {
    const dir = repo(false)
    execFileSync('git', ['worktree', 'add', '-q', join(dir, '.claude/worktrees/w'), '-b', 'w'], { cwd: dir, stdio: 'ignore' })
    expect(run(dir, `git -C ${join(dir, '.claude/worktrees/w')} commit -m x`)?.permissionDecision).toBe('deny')
    const clone = join(dir, '.claude/worktrees/c')
    execFileSync('git', ['clone', '-q', repo(false), clone], { stdio: 'ignore' })
    expect(run(dir, `git -C ${clone} commit -m x`)).toBeNull()
  })
  it('lets a plain push from main through', () => {
    expect(run(repo(true), 'git push origin main')).toBeNull()
  })
  it('denies a force-push to main in this repo', () => {
    const out = run(repo(true), 'git push --force origin main')
    expect(out.permissionDecision).toBe('deny')
  })
})
