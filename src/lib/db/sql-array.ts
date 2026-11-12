import { sql } from 'drizzle-orm'

// Strings as ONE Postgres array parameter (`= any(…)`, `<> all(…)`), each element quoted, so a read is one statement
// with one parameter whatever the count. Drizzle spreads a JS array into a list of parameters instead.

export const arrayParam = (xs: readonly string[], type: 'text' | 'uuid') =>
  sql`${`{${xs.map((x) => `"${x.replace(/["\\]/g, '\\$&')}"`).join(',')}}`}::${sql.raw(type)}[]`
