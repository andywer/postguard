import { defineTable, Schema } from "sqldb/schema"
import { sql } from "sqldb/pg"
import { database } from "./_database"

defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

export async function createUser(name: string, email: string) {
  await database.query(sql`
    INSERT INTO users (name, foo) VALUES (${name}, ${email})
  `)
}
