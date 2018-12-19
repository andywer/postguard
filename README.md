# pg-lint

Static source code analyzer validating SQL queries in JavaScript and TypeScript code.

Built on the [Babel](https://babeljs.io/) stack. Uses [`pg-query-parser`](npmjs.com/package/pg-query-parser), which is built on `libpg_query`, the real-deal Postgres query parser implementation.


## Usage

```sh
pg-lint src/models/*
```


## Example

Source:

```js
// imports go here...

defineTable("users", {
  id: Schema.Number
})

export async function queryUserById (id) {
  const { rows } = await database.query(sql`SELECT * FROM users WHERE ix = ${id}`)
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
-   const { rows } = await database.query(sql`SELECT * FROM users WHERE ix = ${id}`)
+   const { rows } = await database.query(sql`SELECT * FROM users WHERE id = ${id}`)
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


## License

MIT
