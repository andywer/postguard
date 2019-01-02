import { defineTable, Schema } from "sqldb/schema"
import { sql } from "sqldb/pg"
import { database } from "./_database"

defineTable("employees", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  position: Schema.String,
  salary: Schema.Number
})

export async function getHighestPaidEmployees() {
  await database.query(sql`
    SELECT * FROM employees WHERE salary > (SELECT salary from employees WHERE foo = 'bar')
  `)
}
