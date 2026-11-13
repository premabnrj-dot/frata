import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { importPage } from '@/lib/queries/imports'
import { DeleteDrafts } from './_components/delete-drafts'
import { Importer } from './_components/importer'

export const metadata = { title: 'Import products' }

// Products › Import (plan 2026-11-12-product-import PI·1 · 7; mockup views 1 · File, 2 · Check, 3 · Done). Any member
// imports, as any member edits products; costs only for who sees them. The file is read in the browser; this page
// reads the shop's side: what it holds against the caps, a paused job, the history.
export default async function ImportPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const data = await importPage(auth.membership.tenantId, auth.membership.role, new Date()).catch((err) => { console.error('[import page]', err instanceof Error ? err.name : 'error'); return null })
  if (!data) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  return (
    <>
      <PageHeader title="Import products" back={{ href: '/console/products', label: 'Products' }} />
      <Importer data={{ shop: data.shop, running: data.running, latest: data.latest, mappings: data.mappings }} />
      {data.history.length > 0 && (
        <Section flush title="Import history">
          <DataTable label="Import history">
            <DataTableHead><th>When</th><th>File</th><th className="text-right">Added</th><th className="text-right">Updated</th><th>By</th><th><span className="sr-only">Drafts</span></th></DataTableHead>
            <DataTableBody>
              {data.history.map((j) => (
                <DataTableRow key={j.id} dimmed={j.draftsDeleted}>
                  <Td cell="c" className="whitespace-nowrap text-muted-foreground">{dateTimeIN(j.createdAt)}</Td>
                  <Td cell="a" className="font-num [overflow-wrap:anywhere]">{j.fileName}</Td>
                  <Td cell="b" className="text-right"><Numeric>{j.added}</Numeric><span className="md:hidden"> added</span></Td>
                  <Td cell="hide" className="text-right"><Numeric>0</Numeric></Td>
                  <Td cell="e" className="[overflow-wrap:anywhere]">{j.by ?? 'Frrata support'}</Td>
                  <Td cell="d">
                    {!j.finishedAt ? <Badge tone="warn">Paused</Badge>
                      : j.draftsDeleted ? <Badge>Drafts deleted</Badge>
                      : j.added > 0 ? <DeleteDrafts jobId={j.id} fileName={j.fileName} /> : null}
                  </Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </Section>
      )}
    </>
  )
}
