import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parser"
import { UnqualifiedColumnReference } from "../src/types"
import { validateQuery } from "../src/validation"
import { containsToRegex } from "./_helpers/assert"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("can infer column references from spread expression", t => {
  const { queries } = parseSourceFile(loadSourceFile(pathToFixture("insert-spread.ts")))
  const referencedColumns = (queries[0].query
    .referencedColumns as UnqualifiedColumnReference[]).map(colRef => ({
    tableRefsInScope: colRef.tableRefsInScope
      ? colRef.tableRefsInScope.map(tableRef => ({
          tableName: tableRef.tableName,
          as: tableRef.as
        }))
      : colRef.tableRefsInScope,
    columnName: colRef.columnName
  }))
  t.deepEqual(referencedColumns, [
    {
      tableRefsInScope: [{ tableName: "users", as: undefined }],
      columnName: "name"
    },
    {
      tableRefsInScope: [{ tableName: "users", as: undefined }],
      columnName: "email"
    },
    {
      tableRefsInScope: [{ tableName: "users", as: undefined }],
      columnName: "id"
    }
  ])
})

test("fails on missing column values for INSERT", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("insert-value-missing.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`Column "email" is missing from INSERT statement.`))
})

test("fails on bad unqualified column reference", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("column-reference-unqualified.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`No table in the query's scope has a column "password".`))
  t.regex(error.message, containsToRegex(`_fixtures/column-reference-unqualified.ts:11:15`))
})

test("fails on bad qualified column reference", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("column-reference-qualified.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`Table "projects" does not have a column named "email".`))
  t.regex(error.message, containsToRegex(`_fixtures/column-reference-qualified.ts:16:23`))
})

test("fails on bad column reference in INSERT", t => {
  const { queries, tableSchemas } = parseSourceFile(loadSourceFile(pathToFixture("insert.ts")))
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`No table in the query's scope has a column "foo".`))
  t.regex(error.message, containsToRegex(`_fixtures/insert.ts:13:31`))
})
