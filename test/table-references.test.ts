import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parse-file"
import { validateQuery } from "../src/validation"
import { containsToRegex } from "./_helpers/assert"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("fails on bad table reference", t => {
  const { queries, tableSchemas } = parseSourceFile(
    loadSourceFile(pathToFixture("table-reference.ts"))
  )
  const error = t.throws(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`No table with name "people" has been defined.`))
  t.regex(error.message, containsToRegex(`_fixtures/table-reference.ts:11:18`))
})
