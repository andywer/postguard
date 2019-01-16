#!/usr/bin/env node
// tslint:disable no-console

import * as chokidar from "chokidar"
import * as logSymbols from "log-symbols"
import meow from "meow"
import * as path from "path"
import { collectDiagnostics, printDiagnostic, Diagnostic, DiagnosticType } from "./diagnostics"
import * as format from "./format"
import { loadSourceFile, parseSourceFile } from "./parser"
import { QueryInvocation, TableSchema } from "./types"
import { checkSchemasForDuplicates, validateQuery } from "./validation"

const cli = meow(
  `
  Usage
    $ postguard ./path/to/source/*.ts

  Options
    --help        Print this help
    -w, --watch   Watch files and re-evaluate on change
`,
  {
    flags: {
      help: { type: "boolean" },
      w: { type: "boolean" },
      watch: { type: "boolean" }
    }
  }
)

if (cli.input.length === 0) {
  cli.showHelp()
  process.exit(0)
}

const watchMode = Boolean(cli.flags.watch || cli.flags.w)

function run(sourceFilePaths: string[], moreSchemas: TableSchema[] = []) {
  let allQueries: QueryInvocation[] = []
  let allTableSchemas: TableSchema[] = [...moreSchemas]

  sourceFilePaths = sourceFilePaths.map(filePath => path.relative(process.cwd(), filePath))

  let diagnostics: Diagnostic[] = []

  for (const filePath of sourceFilePaths) {
    const fileDiagnostics = collectDiagnostics(() => {
      const { queries, tableSchemas } = parseSourceFile(loadSourceFile(filePath))

      allQueries = [...allQueries, ...queries]
      allTableSchemas = [...allTableSchemas, ...tableSchemas]
    })

    fileDiagnostics.forEach(printDiagnostic)
    diagnostics = [...diagnostics, ...fileDiagnostics]
  }

  const validationDiagnostics = collectDiagnostics(() => {
    checkSchemasForDuplicates(allTableSchemas)

    for (const query of allQueries) {
      validateQuery(query, allTableSchemas)
    }
  })

  validationDiagnostics.forEach(printDiagnostic)
  diagnostics = [...diagnostics, ...validationDiagnostics]

  if (diagnostics.some(diagnostic => diagnostic.type === DiagnosticType.error)) {
    if (!watchMode) process.exit(1)
  } else {
    console.log(
      format.success(
        `${logSymbols.success} Validated ${allQueries.length} queries against ${
          allTableSchemas.length
        } table schemas. All fine!`
      )
    )
  }

  return {
    diagnostics,
    queries: allQueries,
    schemas: allTableSchemas
  }
}

let { schemas } = run(cli.input)

if (watchMode) {
  console.log("\nWatching file changes... Press CTRL + C to cancel.")

  chokidar.watch(cli.input, { ignoreInitial: true }).on("all", (event, filePath) => {
    console.log(format.gray(`\nRe-running after file changed: ${filePath}\n`))
    const schemasInOtherFiles = schemas.filter(schema => schema.sourceFile.filePath !== filePath)
    const lastRunResult = run([filePath], schemasInOtherFiles)

    schemas = lastRunResult.schemas
  })
}
