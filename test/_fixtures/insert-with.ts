import { defineTable, Schema } from "squid/schema"
import { sql } from "squid/pg"
import { database } from "./_database"

defineTable("employers", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  email: Schema.String
})

defineTable("employees", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  email: Schema.String
})

export async function createSomeRecords() {
  await database.query(sql`
    WITH some_employers AS (
      SELECT * FROM employers WHERE id < 5
    )
    INSERT INTO employees SELECT * FROM some_employers
  `)
}
