import { defineTable, Schema } from "squid/schema"
import { sql } from "squid/pg"

defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

sql`
  SELECT * FROM people
`
