import { defineTable, Schema } from "sqldb/schema"
import { sql } from "sqldb/pg"
import { database } from "./_database"

defineTable("employers", {
  id: Schema.default(Schema.Number),
  name: Schema.String
})

defineTable("employees", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  salary: Schema.Number
})

export async function getHighestPaidEmployees() {
  return database.query(sql`
    SELECT * FROM employees WHERE salary > (SELECT salary from employers LIMIT 1)
  `)
}
