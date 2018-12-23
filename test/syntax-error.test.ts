import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parse-file"
import { containsToRegex } from "./_helpers/assert"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("fails on bad table reference", t => {
  const error = t.throws(() => parseSourceFile(loadSourceFile(pathToFixture("syntax-error.ts"))))
  t.is(error.name, "ValidationError")
  t.regex(error.message, containsToRegex(`Syntax error in SQL query.`))
  t.regex(error.message, containsToRegex(`_fixtures/syntax-error.ts:11:31`))
})
