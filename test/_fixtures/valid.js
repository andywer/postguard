import { defineTable, Schema } from "squid/schema"
import { sql, spreadInsert } from "squid/pg"
import { database } from "./database"

defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String
})

export async function queryUserById(id) {
  const { rows } = await database.query(sql`
    SELECT * FROM users WHERE id = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function createUser(record) {
  const { rows } = await database.query(sql`
    INSERT INTO users ${spreadInsert(record)} RETURNING *
  `)
  return rows[0]
}

export async function createUser2(id, name, email) {
  const { rows } = await database.query(sql`
    INSERT INTO users ${spreadInsert({ id, name, email })} RETURNING *
  `)
  return rows[0]
}
