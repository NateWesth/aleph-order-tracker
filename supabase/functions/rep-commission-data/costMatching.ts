type Line = Record<string, unknown>
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? normalize(value) : ''
const generic = (value: unknown) => {
  const v = text(value)
  return !v || ['n/a', 'na', '-', 'item', 'product', 'miscellaneous', 'misc'].includes(v) || v.startsWith('m-misc')
}

export function costSignature(name: unknown, description: unknown): string {
  const n = normalize(name), d = normalize(description)
  return n || d ? `${n}||${d}` : ''
}

// Exact text first; stable product identity is a fallback, never for shared miscellaneous items.
export function costKeys(line: Line): string[] {
  const name = line.name ?? line.item_name
  const description = [line.description, line.sales_description, line.item_description, line.purchase_description]
    .find(value => normalize(value)) ?? ''
  const exact = costSignature(name, description)
  const keys = exact ? [exact] : []
  const sku = [line.sku, line.item_code, line.code].find(value => !generic(value))
  // Placeholder names (N/A) do not invalidate a real SKU. Explicit shared
  // miscellaneous identifiers do, because their item ID is reused too.
  const isShared = [name, line.sku, line.item_code, line.code].some(value => {
    const v = text(value)
    return ['item', 'product', 'miscellaneous', 'misc'].includes(v) || v.startsWith('m-misc')
  })
  if (isShared) {
    if (!generic(description)) keys.push(`desc:${normalize(description)}`)
    return keys
  }
  const id = normalize(line.item_id)
  if (id) keys.push(`id:${id}`)
  if (sku) keys.push(`sku:${normalize(sku)}`)
  return keys
}

export type CostEntry = { date: string; rate: number }
export function resolveBillCost(keys: string[], history: Map<string, CostEntry[]>, invoiceDate: string): number | null {
  for (const key of keys) {
    const entries = history.get(key)
    if (!entries?.length) continue
    const preceding = entries.find(entry => entry.date && entry.date <= invoiceDate)
    if (preceding) return preceding.rate
    return entries[entries.length - 1].rate
  }
  return null
}