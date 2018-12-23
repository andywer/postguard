<h1 align="center">pg-lint</h1>

<p align="center">
Static analyzer validating SQL queries in JavaScript and TypeScript code.
</p>

<br />

Built on the [Babel](https://babeljs.io/) and [TypeScript](http://www.typescriptlang.org/) stack. Uses [`pg-query-parser`](npmjs.com/package/pg-query-parser), which is built on `libpg_query`, the real-deal Postgres query parser implementation.

Use it with [sqldb](https://github.com/andywer/sqldb) template strings. Its tagged template strings some sugar to write short, explicit SQL queries for even complex tables.

When validating TypeScript code, pg-lint will fire up the TypeScript compiler to infer and validate the types of sqldb's `spread*()` arguments. So you have **SQL queries that are type-checked against your code** 😱😱😱


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


## Example

Source:

```js
// imports go here...

defineTable("users", {
  id: Schema.Number
})

export async function queryUserById (id) {
  const { rows } = await database.query(sql`
    SELECT * FROM users WHERE ix = ${id}
  `)
  return rows.length > 0 ? rows[0] : null
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


## Validations

- Checks SQL queries for syntax errors
- Checks that the referenced tables exist
- Checks that the referenced columns exist on the referenced tables


## Debugging

Set the environment variable `DEBUG` to `pg-lint:*` to enable debug logging. You can also narrow debug logging down by setting `DEBUG` to `pg-lint:table` or `pg-lint:query`, for instance.


## Command line options

```
Usage
  $ pg-lint ./path/to/source/*.ts

Options
  --help        Print this help
  -w, --watch   Watch files and re-evaluate on change
```


## License

MIT
