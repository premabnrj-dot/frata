import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const skill = (body: string, meta = '  version: 1.0.0\n  owner: owner\n  verified: 2026-11-16') =>
  `---\nname: demo\ndescription: Use when testing the gate.\nmetadata:\n${meta}\n---\n${body}`

describe('frontmatter', async () => {
  const { readFrontmatter } = await import('../lib/frontmatter.mjs')
  it('reads scalars, one nested map and inline arrays', () => {
    const { data, body } = readFrontmatter('---\nname: x\nmetadata:\n  version: 1.2.3\n  covers: ["a/**", "b.ts"]\n---\nhello\n')
    expect(data).toEqual({ name: 'x', metadata: { version: '1.2.3', covers: ['a/**', 'b.ts'] } })
    expect(body).toBe('hello\n')
  })
  it('a file with no front-matter has no data', () => {
    expect(readFrontmatter('# just a doc').data).toBeNull()
  })
})

describe('check:skills', async () => {
  const { bumpProblem, checkSkill, checkAgent } = await import('../check-skills.mjs')
  const run = (setup: (dir: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), 'skills-'))
    const dir = join(root, 'demo')
    mkdirSync(dir)
    setup(dir)
    const out: string[] = []
    checkSkill(dir, 'demo', (m: string) => out.push(m))
    return out
  }
  it('passes a well-formed skill', () => {
    expect(run((d) => writeFileSync(join(d, 'SKILL.md'), skill('body\n')))).toEqual([])
  })
  it('fails a missing owner, a description not opening "Use when", and a body over 500 lines', () => {
    const out = run((d) => writeFileSync(join(d, 'SKILL.md'),
      `---\nname: demo\ndescription: Helps with things.\nmetadata:\n  version: 1.0.0\n  verified: 2026-11-16\n---\n${'x\n'.repeat(501)}`))
    expect(out.join('\n')).toMatch(/owner is missing/)
    expect(out.join('\n')).toMatch(/should open "Use when/)
    expect(out.join('\n')).toMatch(/max 500/)
  })
  it('fails a reference file that is not linked, and one that links further', () => {
    const out = run((d) => {
      writeFileSync(join(d, 'SKILL.md'), skill('See [a](reference/a.md).\n'))
      mkdirSync(join(d, 'reference'))
      writeFileSync(join(d, 'reference', 'a.md'), 'See [b](b.md).\n')
      writeFileSync(join(d, 'reference', 'b.md'), 'deep\n')
    })
    expect(out.some((m) => m.includes('b.md  is not linked'))).toBe(true)
    expect(out.some((m) => m.includes('links b.md; keep references one level deep'))).toBe(true)
  })
  it('a body changed with the same version fails; a bump, a front-matter-only change or a new file passes', () => {
    const before = skill('rule one\n')
    expect(bumpProblem('x', before, skill('rule two\n'))).toMatch(/still 1\.0\.0/)
    expect(bumpProblem('x', before, skill('rule two\n', '  version: 1.1.0\n  owner: owner\n  verified: 2026-11-16'))).toBeNull()
    expect(bumpProblem('x', before, skill('rule one\n', '  version: 1.0.0\n  owner: someone\n  verified: 2026-11-17'))).toBeNull()
    expect(bumpProblem('x', null, before)).toBeNull()
    expect(bumpProblem('x', before, before, 'ref: rule a', 'ref: rule b')).toMatch(/still 1\.0\.0/)
  })
  it('an agent needs its name, a description and metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'agents-'))
    const f = join(root, 'demo.md')
    writeFileSync(f, '---\nname: other\ndescription: Reviews.\n---\nbody')
    const out: string[] = []
    checkAgent(f, 'demo', (m: string) => out.push(m))
    expect(out.join('\n')).toMatch(/not the file's name/)
    expect(out.join('\n')).toMatch(/metadata.version/)
  })
})

describe('check:plans', async () => {
  const { planProblems } = await import('../check-plans.mjs')
  const head = (status: string, review: string) =>
    `# P\nStatus: ${status}\n**Mockup:** none — tooling\n**Approved:** owner, 2026-11-17\n**Review:** ${review}\n`
  it('passes a plan with its three lines', () => {
    expect(planProblems('p.md', head('active', 'architecture-reviewer READY, 2026-11-17'))).toEqual([])
  })
  it('a draft may wait for its review; an active plan may not', () => {
    expect(planProblems('p.md', head('draft', 'pending'))).toEqual([])
    expect(planProblems('p.md', head('active', 'pending'))).toHaveLength(1)
  })
  it('fails a missing Mockup, an Approved without a date and "none" without a reason', () => {
    expect(planProblems('p.md', '# P\n**Approved:** owner\n**Review:** x, 2026-11-17\n')).toHaveLength(2)
    expect(planProblems('p.md', '# P\n**Mockup:** none\n**Approved:** owner, 2026-11-17\n**Review:** x, 2026-11-17\n')[0]).toMatch(/needs a reason/)
  })
  it('reads only the header: "pending" in the body passes', () => {
    expect(planProblems('p.md', head('active', 'x READY, 2026-11-17') + '\nThe refund stays pending.\n')).toEqual([])
  })
})

describe('check:migrations', async () => {
  const { journalProblems } = await import('../lib/journal.mjs')
  const e = (idx: number, tag: string, when: number) => ({ idx, tag, when })
  it('fails an out-of-order when, a wrong idx and a missing file', () => {
    const out = journalProblems([e(0, '0000_a', 2), e(2, '0001_b', 1)], ['0000_a.sql'])
    expect(out).toHaveLength(3)
  })
  it('lets the one entry applied out of order in production through', () => {
    expect(journalProblems([e(0, '0122_x', 2), e(1, '0123_partner_teams', 1)], ['0122_x.sql', '0123_partner_teams.sql'])).toEqual([])
  })
  it('fails a migration file the journal does not name', () => {
    expect(journalProblems([e(0, '0000_a', 1)], ['0000_a.sql', '0001_b.sql'])[0]).toMatch(/not in the journal/)
  })
})

describe('check:docs', async () => {
  const { missingPaths } = await import('../check-docs.mjs')
  const { coverage, namedPaths } = await import('../lib/doc-refs.mjs')
  it('names a backticked repo path that is gone, with its line; skips placeholders', () => {
    const text = 'See `src/lib/a.ts`.\nAnd `src/lib/gone.ts:12`, `e2e/flows/NN-name.mjs`, `src/<x>/y.ts`, `drizzle/**`.'
    const out = missingPaths('doc.md', text, (p: string) => p === 'src/lib/a.ts')
    expect(out).toEqual(['doc.md:2  names src/lib/gone.ts, which does not exist'])
  })
  it('a living doc covers the files it names and those its covers globs match', () => {
    const tracked = ['CLAUDE.md', '.claude/skills/s/SKILL.md', 'src/lib/a.ts', 'src/lib/b.ts', 'src/x/c.ts', 'docs/specs/old.md']
    const texts: Record<string, string> = {
      'CLAUDE.md': 'Rule in `src/lib/a.ts`.',
      '.claude/skills/s/SKILL.md': '---\nmetadata:\n  covers: ["src/x/**"]\n---\nbody',
      'docs/specs/old.md': 'Names `src/lib/b.ts` but is history.',
    }
    const cov = coverage(tracked, (f: string) => texts[f] ?? '')
    expect([...cov.get('CLAUDE.md')!.keys()]).toEqual(['src/lib/a.ts'])
    expect([...cov.get('.claude/skills/s/SKILL.md')!.keys()]).toEqual(['src/x/c.ts'])
    expect(cov.has('docs/specs/old.md')).toBe(false)
    expect(namedPaths('`src/a.ts:3-9`')[0]).toEqual({ path: 'src/a.ts', line: 1 })
  })
})

describe('check:storefront-build, Console budget', async () => {
  const { appBudgetProblems } = await import('../lib/app-budget.mjs')
  const kb = (n: number) => n * 1024
  const sizes: Record<string, number> = { 'root.js': kb(100), 'console.js': kb(30), 'a.js': kb(15), 'b.js': kb(25) }
  const build = {
    '/layout': ['root.js'],
    '/(console)/layout': ['console.js'],
    '/(console)/console/a/page': ['a.js'],
    '/(console)/console/b/page': ['b.js', 'root.js'],
    '/s/[host]/page': ['b.js'],
  }
  const gz = (f: string) => sizes[f]
  it('counts the layouts above a page once each, and fails a page over budget', () => {
    const out = appBudgetProblems(build, gz, () => {}, 150, {})
    expect(out).toEqual([expect.stringMatching(/^\/\(console\)\/console\/b\/page {2}ships 155\.0 kB/)])
  })
  it('a pinned page passes at its pin, and a pin with no page fails', () => {
    const out = appBudgetProblems(build, gz, () => {}, 150, { '/(console)/console/b/page': 156, '/(console)/console/gone/page': 160 })
    expect(out).toEqual([expect.stringMatching(/gone\/page {2}is pinned/)])
  })
})

describe('the margin under a limit (Vercel builds a page ~0.3 kB heavier)', async () => {
  const { appBudgetRows, marginProblems, closest, VERCEL_MARGIN_KB } = await import('../lib/app-budget.mjs')
  const row = (page: string, kb: number, limit: number) => ({ page, kb, limit })
  it('fails a page under its limit by less than the margin, and passes one with the margin to spare', () => {
    expect(VERCEL_MARGIN_KB).toBe(0.5)
    const out = marginProblems([row('/near', 149.6, 150), row('/fine', 149.4, 150), row('/pinned-near', 133.0, 133.4)])
    expect(out).toEqual([expect.stringMatching(/^\/near {2}ships 149\.60 kB .*within 0\.5 kB of its limit \(150 kB\)/), expect.stringMatching(/^\/pinned-near /)])
  })
  it('leaves a page over its limit to the limit check (one line a problem)', () => {
    expect(marginProblems([row('/over', 150.2, 150)])).toEqual([])
  })
  it('names the three pages with the least room, least first', () => {
    const line = closest([row('/a', 140, 150), row('/b', 149, 150), row('/c', 118, 120), row('/d', 100, 150)])
    expect(line).toBe('/b 149.0/150 kB (1.0 kB room); /c 118.0/120 kB (2.0 kB room); /a 140.0/150 kB (10.0 kB room)')
  })
  it('tells a shop page that a lazy chunk elsewhere may be the cause', () => {
    expect(marginProblems([row('/s/[host]/(shop)/pages/[handle]/page', 109.4, 109.8)])[0]).toMatch(/A shop page: .*runtime/)
    expect(marginProblems([row('/(console)/console/x/page', 149.8, 150)])[0]).toMatch(/\*-facts\.ts half/)
  })
  it('reads each budgeted page with its pin or the budget', () => {
    const kb = (n: number) => n * 1024
    const build = { '/layout': ['r.js'], '/(console)/console/x/page': ['x.js'], '/(admin)/admin/y/page': ['y.js'], '/s/[host]/page': ['x.js'] }
    const sizes: Record<string, number> = { 'r.js': kb(100), 'x.js': kb(40), 'y.js': kb(10) }
    expect(appBudgetRows(build, (f: string) => sizes[f], 150, { '/(admin)/admin/y/page': 112 })).toEqual([
      { page: '/(console)/console/x/page', kb: 140, limit: 150 }, { page: '/(admin)/admin/y/page', kb: 110, limit: 112 }])
  })
})

describe('what a first load may not carry (zod; the shell twice)', async () => {
  const { zodProblems, appShellProblems } = await import('../lib/app-budget.mjs')
  const text: Record<string, string> = { 'r.js': 'react', 'z.js': 'c=u("ZodError",x)', 'm.js': 'n=u("$ZodError",x)', 'p.js': 'page', 'app-shell-0a1b.js': 'shell' }
  const read = (f: string) => text[f] ?? ''
  it('fails a page whose first load holds zod or zod/mini, through a layout too', () => {
    const build = { '/layout': ['r.js'], '/(console)/console/a/page': ['p.js', 'z.js'], '/(console)/console/b/layout': ['m.js'], '/(console)/console/b/c/page': ['p.js'], '/(console)/console/d/page': ['p.js'] }
    expect(zodProblems(build, read)).toEqual([expect.stringMatching(/^\/\(console\)\/console\/a\/page {2}loads zod .*z\.js/), expect.stringMatching(/^\/\(console\)\/console\/b\/c\/page {2}loads zod .*m\.js/)])
  })
  it('fails when a Console page loads no shell chunk, and passes when every one does (through its layout)', () => {
    expect(appShellProblems({ '/(console)/console/layout': ['app-shell-0a1b.js'], '/(console)/console/a/page': ['p.js'] })).toEqual([])
    expect(appShellProblems({ '/(console)/console/a/page': ['p.js'], '/(admin)/admin/page': ['p.js'] })).toEqual([expect.stringMatching(/^1 Console page\(s\) load no app-shell/)])
    expect(appShellProblems({ '/(admin)/admin/page': ['p.js'] })).toEqual([expect.stringMatching(/no Console pages found/)])
  })
})

describe('eval runner locks', async () => {
  const { childEnv, answerArgs, judgeArgs, secretIn, gradeVerdict, scenarios } = await import('../eval.mjs')
  it('a verdict passes only when every behaviour is graded once and met', () => {
    expect(gradeVerdict('MET: a\nMET: b', 2).ok).toBe(true)
    expect(gradeVerdict('MET: a\nNOT MET: b — no', 2)).toMatchObject({ ok: false, misses: 1 })
    expect(gradeVerdict('Looks good overall.', 2).ok).toBe(false)
    expect(gradeVerdict('MET: a\nMET: a\nMET: b', 2).ok).toBe(false)
  })
  it('finds an agent\'s scenarios, and none for a name without evals', () => {
    expect(scenarios('tenancy-auditor')?.map((e: { id: string }) => e.id)).toEqual(['query-outside-withtenant', 'tenant-from-form'])
    expect(scenarios('no-such-agent')).toBeNull()
  })
  it('hands the child only the path, home, proxy, CA and model URL — no tokens', () => {
    const env = childEnv({ PATH: '/bin', HOME: '/h', HTTPS_PROXY: 'p', ANTHROPIC_BASE_URL: 'u', GH_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y', GITHUB_TOKEN: 'z', CLOUDSDK_AUTH_ACCESS_TOKEN: 'w' })
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_BASE_URL', 'HOME', 'HTTPS_PROXY', 'PATH'])
  })
  it('runs read-only tools with no MCP server and project settings only; the judge gets no tools', () => {
    const a = answerArgs('sys')
    expect(a.slice(a.indexOf('--tools'), a.indexOf('--tools') + 2)).toEqual(['--tools', 'Read,Grep,Glob,Skill'])
    for (const f of ['--strict-mcp-config', 'Read(//proc/**)', 'Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(**/.env*)']) expect(a).toContain(f)
    expect(a).not.toContain('Read(~/**)')
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('project')
    const j = judgeArgs()
    expect(j[j.indexOf('--tools') + 1]).toBe('')
  })
  it('refuses to record an answer holding a secret-shaped string', () => {
    expect(secretIn('key rzp_live_ABCDEFGHIJKL1234')).not.toBeNull()
    expect(secretIn('postgres://frata_app:hunter2@db.example.com/x')).not.toBeNull()
    expect(secretIn('a fake key: rzp_test_FAKE')).toBeNull()
  })
})
