# Feedback F1 — brief for each console area (one agent per area)

Plan: `docs/plans/2026-11-12-feedback.md` § F1 (and § Reviews on this plan). Rules: `.claude/skills/frata-design-language/SKILL.md`
§ Feedback (rules 1–8). Architecture: `.claude/skills/frata-architecture/SKILL.md` § Server actions (the paragraph on
`ActionResult`). Primitives (read them first, do not change them): `src/components/ui/toast.tsx`,
`src/components/ui/field-error.tsx`, `src/components/ui/action-form.tsx`, `src/components/ui/dialog.tsx` (its `error` prop),
`src/components/ui/submit.tsx`. The worked example is `src/app/(console)/console/fixtures/ui/primitives.tsx`.

## What to do in each file of your area
1. **A failure after a button** (the action returned an error, a conflict, no connection, an upload refused) shown today as
   a red line (`<p role="alert">`, `text-danger-text`, `<Message>` from `ui/unsaved`, a `bg-danger` block) → `toast.error(words,
   { sub?, action? })` with the SAME words. One action where today's UI offers one (Reload, Try again). Keep "Nothing was
   changed." as `sub` where the words have it. A conflict with Reload: `action: { label: 'Reload', run: … }`.
2. **A success line** (`text-ok-text`, `Message` tone ok, "Saved.") → `toast.ok(words)` (or keep the existing Undo toast).
3. **Inside a `<Dialog>`**: a failure of the dialog's own action goes in the Dialog's `error` prop, not a toast and not a
   paragraph (rule 4). Field mistakes inside a dialog stay at the field (no summary toast there: the hook skips it).
4. **Field mistakes** already shown under a field stay under it, but through `<FieldError name message>` (the mark, the
   words, the motion) with the field carrying `fieldProps(name, error)` (aria-invalid, aria-describedby), and the form
   gets the summary: `useErrorSummary(errors, { attempt, scope: formRef })` where `attempt` increments on each submit
   that returned mistakes and `formRef` is the form (or the section that holds its fields). Where error keys differ from
   field names (variant grid `v:k:f`, `address.*`), make the field's `name`/id and the key match, or pass the mapped map.
   Nothing typed is ever cleared.
5. **Stays where it is (rule 5)** — mark the line with `feedback-ok: <why>` (a comment on the line or the line above):
   "Couldn't count", "Risk unavailable", a domain's row problem, the billing/domain banners, autosave's "Not saved" band
   with Reload, Publish's blocking list, a photo failure that says what to do with its Fix, an offer stopped by Frrata,
   a status line that is not an error (e.g. a risk reason on an order). If unsure, ask in your report rather than guess.
6. **Bugs to fix while there**: share-sheet's QR failure shown green `role=status` → `toast.error`.
7. `useToast()` works anywhere under AppShell (the console layout). In the look editor `(lookeditor)` there is NO Toaster
   yet — area C mounts it (see C).
8. Do not touch: `src/components/ui/*` (primitives), `src/app/(console)/console/apps/delivery_zones/**` (another session is
   working there), anything outside your file list unless a shared helper forces it (say so).

## Checks before you commit (run each, read the output)
- `node scripts/check-feedback.mjs --write` then `node scripts/check-feedback.mjs` (counts only go down; your files should
  reach 0 or only rule-5 lines marked `feedback-ok:`).
- `npm test` (all gates + vitest) and `npx tsc --noEmit -p .`.
- Do NOT run `npm run e2e` or `npm run build` (other agents share the machine's ports; the lead runs them after merging).
- Grep the e2e flows for every sentence you moved (`grep -rn "<words>" e2e/flows`): a flow that reads it with
  `getByRole('alert')` or as a `<p>` must be updated to `expectToast(p, words, kind)` (`e2e/lib.mjs`) or the Dialog's alert.
  List every e2e file you changed.

## Report
Commit on your worktree branch with a message naming the area. Report: files changed, sites moved (count), sites pinned
with `feedback-ok` and why, e2e files updated, anything you were unsure of, and the final `check:feedback` line.
