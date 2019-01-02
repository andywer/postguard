import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parse-file"
import { validateQuery } from "../src/validation"
import { containsToRegex } from "./_helpers/assert"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("validates a WITH AS INSERT statement successfully", t => {
  const { queries, tableSchemas } = parseSourceFile(loadSourceFile(pathToFixture("insert-with.ts")))
  t.notThrows(() => queries.forEach(query => validateQuery(query, tableSchemas)))
})

test("validates a SELECT query with a SELECT subquery successfully", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("select-subqueries.ts"))
  )
  t.notThrows(() => queries.forEach(query => validateQuery(query, tableSchemas)))
})

test("fails on bad unqualified column ref in subquery", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("select-subquery-broken-colref.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`No table in the query's scope has a column "foo".`))
  t.regex(error.message, containsToRegex(`_fixtures/select-subquery-broken-colref.ts:14:81`))
})

test("fails on subquery referencing outer query's column", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("select-subquery-outer-colref.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`No table in the query's scope has a column "salary".`))
  t.regex(error.message, containsToRegex(`_fixtures/select-subquery-outer-colref.ts:18:53`))
})
