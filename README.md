<h1 align="center">pg-lint</h1>

<p align="center">
  <b>Validate SQL queries in JavaScript and TypeScript code against your schema at build time 🚀</b>
</p>

<br />

Locates SQL template strings and schema definitions in your code. Evaluates the queries, matching them against your database schema. Supports type-checking via TypeScript, so you get **statically typed SQL queries validated against your database schema** 😱😱

Use with [squid](https://github.com/andywer/squid). It provides SQL tagged template strings, auto-escapes dynamic expressions to prevent SQL injections and comes with some syntactic sugar to write short, explicit SQL queries.

Parses SQL queries with `libpg_query`, the actual Postgres query parser implementation. Uses Babel and the TypeScript compiler API to parse the source files.

🦄&nbsp;&nbsp;Validates SQL template strings in code<br />
🚀&nbsp;&nbsp;Checks SQL queries [syntax and semantics](#validations)<br />
🔍&nbsp;&nbsp;Runs statically, before any code has run<br />
⚡️&nbsp;&nbsp;No additional runtime overhead<br />

---

<br />

<p align="center">
  <img alt="Screencast" src="./docs/screencast.gif" width="80%" />
</p>

## Installation

```sh
npm install --save-dev pg-lint

# or using yarn:
yarn add --dev pg-lint
```

## CLI

Run the tool like this:

```sh
pg-lint src/models/*
```

You can use `--watch` to watch for file changes:

```sh
pg-lint --watch src/models/*
```

We can use npm's [npx tool](https://blog.npmjs.org/post/162869356040/introducing-npx-an-npm-package-runner) to run the locally installed package:

```sh
npx pg-lint src/models/*
```

## Command line options

```
Usage
  $ pg-lint ./path/to/source/*.ts

Options
  --help        Print this help
  -w, --watch   Watch files and re-evaluate on change
```

## Guide

- **[Usage](./docs/usage.md)** - Hands-on examples how to use the tool
- **[Validations](./docs/validations.md)** - List of validations that will be performed

## Motivation

More and more people are fed up with ORMs, me included. ORMs emphasize inefficient queries and they implement a questionable mindset of using mutable copies of potentially stale remote data as the basis of everything, instead of encouraging atomic updates on the database.

The problem, as it seems, has always been the tooling. Here are your options:

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
