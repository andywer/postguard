import { defineTable, Schema } from "squid/schema"
import { sql } from "squid/pg"
import { database } from "./_database"

defineTable("employees", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  position: Schema.String,
  salary: Schema.Number
})

export async function getSomeEmployees() {
  return database.query(sql`
    SELECT * FROM employees WHERE salary < 50000
    UNION
    SELECT * FROM employees WHERE position = 'intern'
  `)
}

export async function getHighestPaidEmployees() {
  return database.query(sql`
    SELECT * FROM employees WHERE salary > (SELECT salary from employees WHERE position = 'CEO')
  `)
}
