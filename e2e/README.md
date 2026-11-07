# End-to-end flows

`npm run e2e` boots a local stack and runs every flow in `e2e/flows/` in a real
Chromium. `npm run e2e -- --only checkout` runs one; `--no-build` reuses the
last build (only when nothing under `src/` changed since).

**The stack** (`e2e/stack.mjs`): a throwaway Postgres in `/var/tmp/frata-e2e`
on port 54340 (or `E2E_ADMIN_URL`, as in CI), a fresh database every run, every
migration (`scripts/verify/apply-migrations.sh`), then `e2e/seed.sql`; the fake
Supabase auth (`e2e/fakes/auth.mjs`) and fake Razorpay API
(`e2e/fakes/razorpay.mjs`); a production build started on port 3077, the shop
reached as `kesar-studio.frata.test` through Chromium's host resolver. It never
touches Supabase; the app's database password is made up per run.

**A flow** is `e2e/flows/NN-name.mjs` exporting `{ name, run(t) }`. `t.step(name,
fn)` runs one step; assert with `node:assert`; a failed step ends its flow.
`t.db` is a superuser handle on the throwaway database for setting up and
checking; `t.out(name)` is a screenshot path; push page errors into `t.errors`.
Sign in with `signedIn(t.browser, 'owner' | 'staff')` from `e2e/lib.mjs`.

**Rules:** every bug fixed gets a step that fails without the fix. Wait for what
the page shows (`locator.waitFor()`), never a fixed sleep. Assert on the
database as well as the screen when money, stock or state moves. A new flow is
proven by planting the bug it guards against and watching it go red.

Output (screenshots, the app's and fakes' logs) is in `e2e/.out/`, gitignored.
The `e2e-runner` agent runs this and reads the screenshots.
