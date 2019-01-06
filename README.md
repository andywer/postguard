<h1 align="center">pg-lint</h1>

<p align="center">
  <b>Validate SQL queries in JavaScript and TypeScript code against your schema at build time 🚀</b>
</p>

<br />

Locates SQL queries and schema definitions in your source code. Parses the queries, matching them against your database schema. Supports type-checking in TypeScript code, so you get **statically typed SQL queries validated against your database schema** 😱😱

Use with [squid](https://github.com/andywer/squid). It provides SQL tagged template strings, auto-escapes dynamic expressions to prevent SQL injections and comes with some syntactic sugar to write short, explicit SQL queries.

Parses SQL queries with `libpg_query`, the actual Postgres query parser implementation. Uses Babel and the TypeScript compiler API to parse the source files.

🦄&nbsp;&nbsp;Validates SQL template strings in code<br />
🚀&nbsp;&nbsp;Checks SQL queries [syntax and semantics](#validations)<br />
🔍&nbsp;&nbsp;Runs statically, before any code has run<br />
⚡️&nbsp;&nbsp;No additional runtime overhead<br />

## Usage

Run it like that:

```sh
pg-lint src/models/*
```

You can use `--watch` to watch for file changes:

```sh
pg-lint --watch src/models/*
```

We can use npm's [npx tool](https://blog.npmjs.org/post/162869356040/introducing-npx-an-npm-package-runner) to run the locally installed puppet-run program seamlessly:

```sh
npx pg-lint src/models/*
```

<br />

<p align="center">
  <img alt="Screencast" src="./docs/screencast.gif" width="80%" />
</p>

## Example

Source:

```js
const { defineTable, Schema } = require("squid/schema")
const { sql } = require("squid/pg")

// Still works if you put the schema in another file
defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.JSON
})

async function queryUserById(id) {
  const { rows } = await database.query(sql`
    SELECT * FROM users WHERE ix = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
}

module.exports = {
  queryUserById
}
```

```
$ pg-lint src/models/user.js
✖ Query validation failed in ./test.ts:10:44:

  No table in the query's scope has a column "ix":

> 1 | SELECT * FROM users WHERE ix = $1
    |                           ^
```

Now let's fix the issue:

```diff
  export async function queryUserById (id) {
    const { rows } = await database.query(sql`
-     SELECT * FROM users WHERE ix = ${id}
+     SELECT * FROM users WHERE id = ${id}
    `)
  return rows.length > 0 ? rows[0] : null
}
```

```
$ pg-lint src/models/user.js
✔ Validated 1 queries against 1 table schemas. All fine!
```

## TypeScript

The sample above, now in TypeScript and as an INSERT:

```ts
import { defineTable, Schema, NewTableRow, TableRow } from "squid/schema"
import { sql, spreadInsert } from "squid/pg"

type NewUserRecord = NewTableRow<typeof usersTable>
type UserRecord = TableRow<typeof usersTable>

const usersTable = defineTable("users", {
  id: Schema.default(Schema.Number),
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.JSON
})

export async function createUser(values: NewUserRecord) {
  const { rows } = await database.query<UserRecord>(sql`
    INSERT INTO users ${spreadInsert(values)} RETURNING *
  `)
  return rows[0]
}
```

In TypeScript you get to enjoy these benefits:

- Infers types in `spreadInsert(values)`, checking that `values` contains all required column values
- Checks that the result columns of the query match the expected result type defined by `database.query<UserRecord>()`
- The `NewUserRecord` & `UserRecord` types are inferred from the `users` table schema

## Command line options

```
Usage
  $ pg-lint ./path/to/source/*.ts

Options
  --help        Print this help
  -w, --watch   Watch files and re-evaluate on change
```

## Validations

#### Checks referenced columns & tables against schema

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

#### Checks INSERT query values for completeness

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

#### Checks spread expression types (TypeScript only)

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

#### Checks query result columns against type (TypeScript only)

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

#### Catches SQL syntax errors

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

## Motivation

More and more people are fed up with ORMs, me included. ORMs emphasize inefficient queries and they implement a questionable mindset of using mutable copies of potentially stale remote data as the basis of everything, instead of encouraging atomic updates on the database.

The problem, it seems, has always been the tooling. Here are your options:

- ORMs - Very popular, but potentially a foot gun in the long run (see above)
- Query builders - Like ORMs, but functional & immutable; an additional layer (and potential source of errors) on top of the SQL queries
- Plain SQL - Total control and transparency, but string-based; thus they could never be reasoned about at build time and queries are potentially quite verbose (many columns mean very verbose, dull INSERT statements)

Having worked with ORMs and different database technologies for a couple of years, I finally decided to stray away, cut out the middleman and go back to plain SQL queries.

It did save me some headaches I had before, but it also required me to maintain a very high test coverage, since there is no confidence in those text queries unless you actually run them. Jumping out of the frying pan into the fire... Yet, the overall approach felt right. **If there was just a way to catch errors in those SQL queries at compile time.**

Enter the stage, `pg-lint`. Let's write SQL queries as template strings, concise, yet explicit, and evaluate them at build time. Even with type inference for TypeScript code!

Under the hood it will use Babel to parse the source code, grab those SQL template strings and table schema definitions, parse the templated SQL queries with the actual official Postgres SQL parsing library and then match the whole thing against your table schema.

Finally, statically typed string templates! 🤓

## Debugging

Set the environment variable `DEBUG` to `pg-lint:*` to enable debug logging. You can also narrow debug logging down by setting `DEBUG` to `pg-lint:table` or `pg-lint:query`, for instance.

## Questions? Feedback?

Feedback is welcome, as always. Feel free to comment what's on your mind 👉 [here](https://github.com/andywer/pg-lint/issues/1).

## License

MIT
