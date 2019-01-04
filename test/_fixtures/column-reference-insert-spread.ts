import { defineTable, NewTableRow, Schema } from "squid/schema"
import { spreadInsert, sql } from "squid/pg"
import { database } from "./_database"

type NewUserRecord = NewTableRow<typeof usersTable>

const usersTable = defineTable("users", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  email: Schema.String
})

export async function createUser(record: NewUserRecord) {
  await database.query(sql`
    INSERT INTO users ${spreadInsert(record)}
  `)
}
