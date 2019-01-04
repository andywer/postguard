import { defineTable, Schema, TableRow } from "squid/schema"
import { sql, spreadInsert } from "squid/pg"
import { database } from "./_database"

const usersTable = defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

type UserRecord = TableRow<typeof usersTable>

export async function queryUserById(id: string) {
  const { rows } = await database.query<UserRecord>(sql`
    SELECT * FROM users WHERE id = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function createUser(record: UserRecord) {
  const { rows } = await database.query(sql`
    INSERT INTO users ${spreadInsert(record)} RETURNING *
  `)
  return rows[0]
}

sql`
  SELECT gmailers.name FROM users AS gmailers WHERE email LIKE '%@gmail.com'
`
