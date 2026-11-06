import 'server-only'
import { categoryById, COLOUR_FAMILIES, describeAttribute } from '@/domains/catalogue/taxonomy'
import type { Rule } from '@/domains/catalogue/collection-rules'
import { productFacts, usedAttributeValues } from '@/lib/queries/catalogue'
import type { AttrOption, ProductPick } from './collection-editor'

/** What every collection editor needs: the shop's products, colour families, and the detail values in use, named. */
export async function editorData(tenantId: string) {
  const [facts, used] = await Promise.all([productFacts(tenantId), usedAttributeValues(tenantId)])
  const products: ProductPick[] = facts.map((f) => ({ id: f.id, title: f.title, status: f.status }))
  const attrOptions: AttrOption[] = used.flatMap(({ attribute, values }) => {
    const a = describeAttribute(attribute)
    return a ? values.map((v) => ({ handle: attribute, value: v, label: `${a.name}: ${a.values.find((x) => x.id === v)?.name ?? v}` })) : []
  }).sort((a, b) => a.label.localeCompare(b.label))
  return { products, attrOptions, families: COLOUR_FAMILIES }
}

/** Category names for rules already saved. */
export const categoryNames = (rules: Rule[]) => Object.fromEntries(rules.filter((r) => r.field === 'category').map((r) => [r.value, categoryById(r.value)?.name ?? r.value]))
