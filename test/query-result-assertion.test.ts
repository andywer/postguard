import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parser"
import { validateQuery } from "../src/validation"
import { containsToRegex } from "./_helpers/assert"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("valid result type on INSERT RETURNING query passes", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("insert-spread.ts"))
  )
  t.notThrows(() => queries.forEach(query => validateQuery(query, tableSchemas)))
})

test("valid result type on UPDATE RETURNING query passes", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("update-spread.ts"))
  )
  t.notThrows(() => queries.forEach(query => validateQuery(query, tableSchemas)))
})

test("fails on INSERT RETURNING query not matching result type", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("insert-returning-bad-result-type.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`Query's result does not match the expected result type.`))
  t.regex(error.message, containsToRegex(`Missing columns in result rows: "foo"`))
  t.regex(error.message, containsToRegex(`_fixtures/insert-returning-bad-result-type.ts:14:24`))
})
