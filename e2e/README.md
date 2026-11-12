# End-to-end flows

`npm run e2e` boots a local stack and runs every flow in `e2e/flows/` in a real
Chromium. `npm run e2e -- --only checkout` runs one; `--no-build` reuses the
last build (only when nothing under `src/` changed since).

**The stack** (`e2e/stack.mjs`): a throwaway Postgres in `/var/tmp/frata-e2e`
on port 54340 (or `E2E_ADMIN_URL`, as in CI), a fresh database every run, every
migration (`scripts/verify/apply-migrations.sh`), then `e2e/seed.sql`; the fake
Supabase auth (`e2e/fakes/auth.mjs`) and fake Razorpay API
(`e2e/fakes/razorpay.mjs`); a stand-in Blob store (`e2e/fakes/blob.mjs`: a flow puts what the browser
uploaded there, and the app reads it through the test-only preload `e2e/fakes/blob-read.mjs`); a production build started on port 3077, the shop
reached as `kesar-studio.frata.test` through Chromium's host resolver. It never
touches Supabase; the app's database password is made up per run.

**A flow** is `e2e/flows/NN-name.mjs` exporting `{ name, run(t) }`. `t.step(name,
fn)` runs one step; assert with `node:assert`; a failed step ends its flow.
`t.db` is a superuser handle on the throwaway database for setting up and
checking; `t.out(name)` is a screenshot path; push page errors into `t.errors`.
Sign in with `signedIn(t.browser, 'owner' | 'staff' | 'frata')` from `e2e/lib.mjs`
(`frata` is Frata staff; it exists only once a flow adds its `platform_staff` row,
as 90-ux's fixture does). Admin works: the stack sets a per-run `frata_admin`
password and `ADMIN_DATABASE_URL`. `E2E_ADMIN_URL` must be localhost or
127.0.0.1, or the run refuses (role passwords are server-wide).

**Rules:** every bug fixed gets a step that fails without the fix. Wait for what
the page shows (`locator.waitFor()`), never a fixed sleep. Assert on the
database as well as the screen when money, stock or state moves. A new flow is
proven by planting the bug it guards against and watching it go red.

**The UX net** (`flows/90-ux.mjs`, runs last) loads `fixtures/ux-stress.sql`
(refuses any database but `frata_e2e`), measures every Console and Admin page
at 320, 390, 1280 and 200 % (`ux-measure.mjs`) and compares the failures with
`ux-known.mjs`: a new or worse failure fails it, so does a known one that now
passes. The full list is `.out/90-ux-failures.txt`. Fixing one means deleting
(or lowering the ceiling of) its line. It leaves its data; the next run drops
the database.

Output (screenshots, the app's and fakes' logs) is in `e2e/.out/`, gitignored.
The `e2e-runner` agent runs this and reads the screenshots.
