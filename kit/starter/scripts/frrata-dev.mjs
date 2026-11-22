#!/usr/bin/env node
// `npm run frrata [store]`: signs this computer in to the store (Frrata's device sign-in) and starts `next dev` with a
// Build key. You type the code it shows in Frrata's Partner workspace › Developer and give the key with your passkey.
// The key lives only in this process and the `next dev` it starts (its environment): never written to a file, never
// printed, gone when you stop it. It ends after 24 hours; run this again then. The store comes from the argument or
// FRRATA_STORE in .env.local. Until the `frrata` package is published, this is the starter's `npx frrata dev`.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { consoleOf, envFile, pollStep, storeOf } from './frrata-dev-lib.mjs'
import { DONE, WAITING } from './frrata-words.mjs'

const env = { ...(existsSync('.env.local') ? envFile(readFileSync('.env.local', 'utf8')) : {}), ...process.env }
const store = storeOf(process.argv.slice(2), env)
if (!store) { console.error('Name your store: npm run frrata <store>, or FRRATA_STORE in .env.local.'); process.exit(1) }
const origin = consoleOf(env)
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000))

async function post(path, body) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
      return { status: r.status, body: await r.json().catch(() => ({})) }
    } catch {
      if (i >= 3) return { status: 0, body: { message: 'Frrata could not answer. Check your connection and try again.' } }
      await sleep(2 + i * 3)
    }
  }
}

const started = await post('/api/dev/device/start', { store })
if (started.status !== 200 || !started.body.device) { console.error(started.body.message ?? 'Frrata could not answer. Try again in a minute.'); process.exit(1) }
const { device, interval = 5, message } = started.body
console.log(`\n${message}\n\n${WAITING}`)

let key = null, said = null
while (!key) {
  await sleep(interval)
  const r = await post('/api/dev/device/poll', { device })
  const step = pollStep(r.status, r.body, interval)
  if (step.next === 'key') key = step.key
  else if (step.next === 'stop') { console.error(step.say); process.exit(1) }
  else {
    if (step.say && step.say !== said) console.log(step.say)
    said = step.say ?? said
    if (step.seconds > interval) await sleep(step.seconds - interval)
  }
}
console.log(`${DONE}\n`)

// The key goes to `next dev` in its environment only (Next keeps a variable already set over .env.local's).
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev'], { stdio: 'inherit', env: { ...process.env, FRRATA_KEY: key, FRRATA_KEY_MODE: 'header' } })
key = null
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
child.on('exit', (code) => process.exit(code ?? 0))
