import { defineTable, Schema } from "sqldb/schema"
import { sql } from "sqldb/pg"

defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

defineTable("projects", {
  id: Schema.Number,
  owner_id: Schema.Number
})

sql`
  SELECT users.name, projects.email FROM users, projects WHERE users.id = projects.owner_id
`
