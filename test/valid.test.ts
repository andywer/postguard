import test from "ava"
import * as path from "path"
import { throwDiagnostics } from "../src/diagnostics"
import { loadSourceFile, parseSourceFile } from "../src/parser"
import { validateQuery } from "../src/validation"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("can parse and validate a JS file successfully", t => {
  const { queries, tableSchemas } = parseSourceFile(loadSourceFile(pathToFixture("valid.js")))
  t.notThrows(() =>
    throwDiagnostics(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  )
})

test("can parse and validate a TS file successfully", t => {
  const { queries, tableSchemas } = parseSourceFile(loadSourceFile(pathToFixture("valid.ts")))
  t.notThrows(() =>
    throwDiagnostics(() => queries.forEach(query => validateQuery(query, tableSchemas)))
  )
})
