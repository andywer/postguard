#!/usr/bin/env node

import * as chokidar from "chokidar"
import * as logSymbols from "log-symbols"
import meow from "meow"
import * as path from "path"
import { isAugmentedError } from "./errors"
import * as format from "./format"
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

function checkSchemasForDuplicates (allTableSchemas: TableSchema[]) {
  for (const schema of allTableSchemas) {
    const schemasMatchingThatName = allTableSchemas.filter(someSchema => someSchema.tableName === schema.tableName)
    if (schemasMatchingThatName.length > 1) {
      throw new Error(
        `Table ${schema.tableName} has been defined more than once:\n` +
        schemasMatchingThatName.map(duplicate => {
          const lineRef = duplicate.loc ? `:${duplicate.loc.start.line}` : ``
          return `  - ${duplicate.filePath}${lineRef}`
        }).join("\n")
      )
    }
  }
}

function run (sourceFilePaths: string[], moreSchemas: TableSchema[] = []) {
  let allQueries: Query[] = []
  let allTableSchemas: TableSchema[] = [...moreSchemas]

  sourceFilePaths = sourceFilePaths.map(filePath => path.relative(process.cwd(), filePath))

  try {
    for (const filePath of sourceFilePaths) {
      const { queries, tableSchemas } = parseFile(filePath)
      // TODO: Check that no table is defined twice

      allQueries = [...allQueries, ...queries]
      allTableSchemas = [...allTableSchemas, ...tableSchemas]
    }

    checkSchemasForDuplicates(allTableSchemas)

    for (const query of allQueries) {
      assertNoBrokenTableRefs(query, allTableSchemas)
      assertNoBrokenColumnRefs(query, allTableSchemas)
    }

    console.log(format.success(
      `${logSymbols.success} Validated ${allQueries.length} queries against ${allTableSchemas.length} table schemas. All fine!`
    ))
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

  return {
    queries: allQueries,
    schemas: allTableSchemas
  }
}

let { schemas } = run(cli.input)

if (watchMode) {
  console.log(`\nWatching file changes... Press CTRL + C to cancel.\n`)

  chokidar.watch(cli.input).on("all", (event, filePath) => {
    const schemasInOtherFiles = schemas.filter(schema => schema.filePath !== filePath)
    const lastRunResult = run([ filePath ], schemasInOtherFiles)

    schemas = lastRunResult.schemas
    console.log("")
  })
}
