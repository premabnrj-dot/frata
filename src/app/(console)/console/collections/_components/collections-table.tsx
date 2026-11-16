import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { Icon } from '@/components/icons/icon'
import { Badge } from '@/components/ui/badge'

type Row = { id: string; title: string; handle: string; kind: 'manual' | 'auto'; count: number }

/** The collections list's rows, the owner's and a Builder's (T1c): `external` opens each in the store preview. */
export function CollectionsTable({ rows, href, external = false }: { rows: Row[]; href: (handle: string) => string; external?: boolean }) {
  return (
    <DataTable>
      <DataTableHead><th>Collection</th><th>Filled by</th><th className="text-right">Products</th>{external && <th className="w-10"><span className="sr-only">Preview</span></th>}</DataTableHead>
      <DataTableBody>
        {rows.map((r) => (
          <DataTableRow key={r.id}>
            <Td cell="a"><Link href={href(r.handle)} data-row-link prefetch={false} aria-label={external ? `Open ${r.title} in preview` : undefined} className="font-medium hover:underline">{r.title}</Link><span className="block font-mono text-xs text-muted-foreground">/collections/{r.handle}</span></Td>
            <Td cell="d"><Badge tone={r.kind === 'auto' ? 'info' : 'neutral'}>{r.kind === 'auto' ? 'Rules' : 'Hand-picked'}</Badge></Td>
            <Td cell="b" className="text-right"><Numeric>{r.count}</Numeric></Td>
            {external && <Td cell="hide"><Icon name="external" className="size-4 text-muted-foreground" /></Td>}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}
