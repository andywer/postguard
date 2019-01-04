<h1 align="center">pg-lint</h1>

<p align="center">
  <b>Validate SQL queries in JavaScript and TypeScript code against your schema at build time 🚀</b>
</p>

<br />

Parses source files with [Babel](https://babeljs.io/). Will additionally fire up the [TypeScript](http://www.typescriptlang.org/) compiler to infer and validate the types of template expressions for TypeScript source files. So you get **SQL queries that are type-checked against your code** 😱😱

Use with [squid](https://github.com/andywer/squid). It provides SQL tagged template strings, auto-escapes dynamic expressions to prevent SQL injections and comes with some syntactic sugar to write short, explicit SQL queries.

Parses SQL queries with [`pg-query-parser`](npmjs.com/package/pg-query-parser). It is built on `libpg_query`, the actual Postgres query parser implementation.

## Usage

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

// The schema definition can be in another file, of course
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
import { defineTable, Schema, TableRow } from "squid/schema"
import { sql, spreadInsert } from "squid/pg"

const usersTable = defineTable("users", {
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.JSON
})

type UserRecord = TableRow<typeof usersTable>

export async function createUser(record: UserRecord) {
  const { rows } = await database.query(sql`
    INSERT INTO users ${spreadInsert(record)} RETURNING *
  `)
  return rows[0] as UserRecord
}
```

The `spreadInsert()` helper is also available in JavaScript, but in TypeScript you get some additional benefits:

- Type-inference of `spreadInsert(record)`, checking that `record` matches the `users` schema
- The `UserRecord` type is inferred from the `users` table schema

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

## Validations

- Checks SQL queries for syntax errors
- Checks that the referenced tables exist
- Checks that the referenced columns exist on the referenced tables
- Checks that each table's schema is only defined once

## Command line options

```
Usage
  $ pg-lint ./path/to/source/*.ts

Options
  --help        Print this help
  -w, --watch   Watch files and re-evaluate on change
```

## Debugging

Set the environment variable `DEBUG` to `pg-lint:*` to enable debug logging. You can also narrow debug logging down by setting `DEBUG` to `pg-lint:table` or `pg-lint:query`, for instance.

## Questions? Feedback?

Feedback is welcome, as always. Feel free to comment what's on your mind 👉 [here](https://github.com/andywer/pg-lint/issues/1).

## License

MIT
