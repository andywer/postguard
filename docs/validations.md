# Validations

#### Column & table references

```
  No table in the query's scope has a column "if".
  Tables in scope: "users"

  12 | export async function queryUserByID (id: number) {
  13 |   const { rows } = await database.query<UserRecord>(sql`
> 14 |     SELECT * FROM users WHERE if = ${id}
     |                               ^
  15 |   `)
  16 |   return rows.length > 0 ? rows[0] : null
  17 | }
```

#### Completeness of INSERT values

```
  Column "email" is missing from INSERT statement.

   4 |
   5 | export async function createUser (name: string) {
>  6 |   const { rows } = await database.query<NewUserRecord>(sql`
     |                                                           ^
>  7 |     INSERT INTO users (name) VALUES (${name}) RETURNING *
     | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
>  8 |   `)
     | ^^
   9 |   return rows[0]
  10 | }
  11 |
```

#### Spread expression types (TypeScript only)

```
  Column "email" is missing from INSERT statement.

   4 |
   5 | export async function createUser (newUser: { name: string }) {
>  6 |   const { rows } = await database.query<NewUserRecord>(sql`
     |                                                           ^
>  7 |     INSERT INTO users ${spreadInsert(newUser)} RETURNING *
     | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
>  8 |   `)
     | ^^
   9 |   return rows[0]
  10 | }
  11 |
```

#### Type-check result columns (TypeScript only)

```
  Query's result does not match the expected result type.
    Missing columns in result rows: "created_at"
    Actual columns in result rows: "id", "name", "email"

  11 |
  12 | export async function queryUserByID (id: number) {
> 13 |   const { rows } = await database.query<UserRecord>(sql`
     |                                        ^^^^^^^^^^^^
  14 |     SELECT id, name, email FROM users WHERE id = ${id}
  15 |   `)
  16 |   return rows.length > 0 ? rows[0] : null
```

#### SQL syntax errors

```
  Syntax error in SQL query.
  Substituted query: INSERT users SELECT $1 RETURNING *

   5 | export async function createUser (newUser: NewUserRecord) {
   6 |   const { rows } = await database.query<NewUserRecord>(sql`
>  7 |     INSERT users ${spreadInsert(newUser)} RETURNING *
     |            ^
   8 |   `)
   9 |   return rows[0]
  10 | }
```
