# Usage

## JavaScript

Source:

```js
const { defineTable, Schema } = require("squid/schema")
const { sql } = require("squid/pg")

// Still works if you put the schema in another file
defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.JSON
})

async function queryUserById(id) {
  const { rows } = await database.query(sql`
    SELECT * FROM users WHERE ix = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
}

module.exports = {
  queryUserById
}
```

```
$ pg-lint src/models/user.js
✖ Query validation failed in ./test.ts:10:44:

  No table in the query's scope has a column "ix":

> 1 | SELECT * FROM users WHERE ix = $1
    |                           ^
```

Now let's fix the issue:

```diff
  export async function queryUserById (id) {
    const { rows } = await database.query(sql`
-     SELECT * FROM users WHERE ix = ${id}
+     SELECT * FROM users WHERE id = ${id}
    `)
  return rows.length > 0 ? rows[0] : null
}
```

```
$ pg-lint src/models/user.js
✔ Validated 1 queries against 1 table schemas. All fine!
```

## TypeScript

The sample above, now in TypeScript and as an INSERT:

```ts
import { defineTable, Schema, NewTableRow, TableRow } from "squid/schema"
import { sql, spreadInsert } from "squid/pg"

type NewUserRecord = NewTableRow<typeof usersTable>
type UserRecord = TableRow<typeof usersTable>

const usersTable = defineTable("users", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.JSON
})

export async function createUser(values: NewUserRecord) {
  const { rows } = await database.query<UserRecord>(sql`
    INSERT INTO users ${spreadInsert(values)} RETURNING *
  `)
  return rows[0]
}
```

In TypeScript you get to enjoy these benefits:

- Infers types in `spreadInsert(values)`, checking that `values` contains all required column values
- Checks that the result columns of the query match the expected result type defined by `database.query<UserRecord>()`
- The `NewUserRecord` & `UserRecord` types are inferred from the `users` table schema
