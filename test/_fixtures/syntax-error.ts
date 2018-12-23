import { defineTable, Schema } from "sqldb/schema"
import { sql } from "sqldb/pg"

defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

sql`
  SELECT * FROM users FOOBAR NULL
`
