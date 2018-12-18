import { database } from "./database"
import { defineTable, Schema, TableRow } from "./pg-schema"
import { sql } from "./sql"

defineTable("users", {
  id: Schema.Number
})

export async function queryUserById (id: number) {
  const { rows } = await database.query(sql`SELECT * FROM users WHERE id = ${id}`)
  return rows.length > 0 ? rows[0] : null
}
