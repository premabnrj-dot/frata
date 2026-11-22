import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { requirePartner } from '@/lib/auth/require-partner'
import { E2E_FIXTURES } from '@/lib/env'
import { Workbench } from './_workbench/workbench'

// TEST-ONLY: the Studio workbench's shell on fixture data (plan docs/plans/2026-11-22-studio-workbench.md WB·3, WB·7),
// the parity target for mockup-parity-reviewer against docs/mockups/2026-11-22-studio-workbench.html screen 1, and the
// page e2e/flows/96-studio.mjs runs. Answers only when the e2e stack sets E2E_FIXTURES=1 and a live partner person has
// passed their check; elsewhere a 404. Never linked from navigation. Outside the workspace's shell, as Studio is a
// screen of its own (its top bar goes back to Clients). No agent, hosting, credits or database read beyond the guard.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Studio · House of Ayuda', robots: { index: false } }

/** The shell's states for the flow (fixtures only): ?builder=1, ?nologo=1, ?waiting=1. */
export default async function StudioFixture({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!E2E_FIXTURES) notFound()
  const auth = await requirePartner()
  if (!auth.ok) notFound()
  const q = (await searchParams) ?? {}
  return <Workbench flags={{ builder: q.builder === '1', noLogo: q.nologo === '1', waiting: q.waiting === '1' }} />
}
