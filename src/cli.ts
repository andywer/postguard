#!/usr/bin/env node

import * as chokidar from "chokidar"
import * as logSymbols from "log-symbols"
import meow from "meow"
import { isAugmentedError } from "./errors"
import { parseFile, Query, TableSchema } from "./parse-file"
import { assertNoBrokenColumnRefs, assertNoBrokenTableRefs } from "./validation"

const cli = meow(`
  Usage
    $ pg-lint ./path/to/source/*.ts

  Options
    --help        Print this help
    -w, --watch   Watch files and re-evaluate on change
`, {
  flags: {
    help: { type: "boolean" },
    w: { type: "boolean" },
    watch: { type: "boolean" }
  }
})

if (cli.input.length === 0) {
  cli.showHelp()
  process.exit(0)
}

const watchMode = Boolean(cli.flags.watch || cli.flags.w)

function run (sourceFilePaths: string[]) {
  let allQueries: Query[] = []
  let allTableSchemas: TableSchema[] = []

  try {
    for (const filePath of sourceFilePaths) {
      const { queries, tableSchemas } = parseFile(filePath)
      // TODO: Check that no table is defined twice

      allQueries = [...allQueries, ...queries]
      allTableSchemas = [...allTableSchemas, ...tableSchemas]
    }

    for (const query of allQueries) {
      assertNoBrokenTableRefs(query, allTableSchemas)
      assertNoBrokenColumnRefs(query, allTableSchemas)
    }

    console.log(`${logSymbols.success} Validated ${allQueries.length} queries against ${allTableSchemas.length} table schemas. All fine!`)
  } catch (error) {
    if (isAugmentedError(error)) {
      const [firstLine, ...lines] = String(error.message).split("\n")
      const linesIndented = lines.map(line => line.match(/^>?\s*\d*\s*\|/) ? line : `  ${line}`)
      console.error(`${logSymbols.error} ${[firstLine, ...linesIndented].join("\n")}`)
    } else {
      console.error(error.stack)
    }
    if (!watchMode) {
      process.exit(1)
    }
  }
}

run(cli.input)

if (watchMode) {
  console.log(`\nWatching file changes... Press CTRL + C to cancel.\n`)

  chokidar.watch(cli.input).on("all", (event, filePath) => {
    run([ filePath ])
    console.log("")
  })
}
