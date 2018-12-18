#!/usr/bin/env node

import * as logSymbols from "log-symbols"
import meow from "meow"
import { isAugmentedError } from "./errors"
import { parseFile, Query, TableSchema } from "./parse-file"
import { assertNoBrokenColumnRefs, assertNoBrokenTableRefs } from "./validation"

const cli = meow(`
  Usage
    $ pg-lint ./path/to/source/*.ts
`)

let allQueries: Query[] = []
let allTableSchemas: TableSchema[] = []

try {
  for (const filePath of cli.input) {
    const { queries, tableSchemas } = parseFile(filePath)
    // TODO: Check that no table is defined twice

    allQueries = [...allQueries, ...queries]
    allTableSchemas = [...allTableSchemas, ...tableSchemas]
  }

  for (const query of allQueries) {
    assertNoBrokenTableRefs(query, allTableSchemas)
    assertNoBrokenColumnRefs(query, allTableSchemas)
  }
} catch (error) {
  if (isAugmentedError(error)) {
    const [firstLine, ...lines] = String(error.message).split("\n")
    const linesIndented = lines.map(line => line.match(/^>?\s*\d*\s*\|/) ? line : `  ${line}`)
    console.error(`${logSymbols.error} ${[firstLine, ...linesIndented].join("\n")}`)
  } else {
    console.error(error.stack)
  }
  process.exit(1)
}

console.log(`${logSymbols.success} Validated ${allQueries.length} queries against ${allTableSchemas.length} table schemas. All fine!`)
