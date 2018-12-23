import { defineTable, Schema, TableRow } from "sqldb/schema"
import { sql, spreadInsert } from "sqldb/pg"
import { database } from "./_database"

const usersTable = defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

export async function queryUserById(id: string) {
  const { rows } = await database.query(sql`
    SELECT * FROM users WHERE id = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function createUser(record: TableRow<typeof usersTable>) {
  const { rows } = await database.query(sql`
    INSERT INTO users ${spreadInsert(record)} RETURNING *
  `)
  return rows[0]
}

sql`
  SELECT gmailers.name FROM users AS gmailers WHERE email LIKE '%@gmail.com'
`
