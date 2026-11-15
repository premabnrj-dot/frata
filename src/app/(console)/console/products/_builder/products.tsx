import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Icon } from '@/components/icons/icon'
import { Panel } from '@/components/ui/panel'
import type { ListQuery } from '@/domains/catalogue/list-query'
import type { BuilderActor } from '@/lib/db/actor'
import { builderProducts } from '@/lib/queries/builder'
import { errName } from '@/lib/log'
import { ProductCells } from '../_components/product-cells'
import { ProductsListView } from '../_components/products-list-view'
import { row } from '../_components/rows'
import type { Row } from '../_components/product-table'

/** A Builder's Products (T1c; approved mockup screens 7 and 8): the owner's list, view only — no selection, no Add,
 *  Import or More — read as frata_builder; each row opens the product in the store preview. */
export async function BuilderProducts({ actor, query, now }: { actor: BuilderActor; query: ListQuery; now: Date }) {
  const list = await builderProducts(actor, query).catch((err) => { console.error('[builder products]', errName(err)); return null })
  if (!list) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const rows = list.rows.map((r) => row(r, now, (h) => `/console/preview/products/${h}`))
  return <ProductsListView list={list} query={query} rows={rows} table={<ViewOnlyTable rows={rows} />} />
}

function ViewOnlyTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable label="Products">
      <DataTableHead>
        <th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Status</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Sizes and colours</th>
        <th className="w-10"><span className="sr-only">Preview</span></th>
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => (
          <DataTableRow key={r.id} tall>
            <ProductCells r={r} external />
            <Td cell="hide"><Icon name="external" className="size-4 text-muted-foreground" /></Td>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}
