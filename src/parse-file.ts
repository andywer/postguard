import { parse, traverse } from "@babel/core"
import createDebugLogger from "debug"
import * as fs from "fs"
import { getReferencedNamedImport } from "./babel-parser-utils"
import { fail } from "./errors"
import { parseQuery } from "./parse-query"
import { parseTableDefinition } from "./parse-table-definition"
import { Query, SourceFile, TableSchema } from "./types"
import { compileFiles } from "./typescript/file"

export {
  Query,
  TableSchema
}

const debugFile = createDebugLogger("pg-lint:file")
const debugQueries = createDebugLogger("pg-lint:query")
const debugTables = createDebugLogger("pg-lint:table")

function compileTypeScript (filePath: string) {
  try {
    return compileFiles([filePath])
  } catch (error) {
    console.error(`Compiling TypeScript source file ${filePath} failed: ${error.message}`)
  }
}

function instantiateSourceFile (filePath: string): SourceFile {
  const fileContent = fs.readFileSync(filePath, "utf8")
  const program = filePath.endsWith(".ts") ? compileTypeScript(filePath) : undefined

  return {
    fileContent,
    filePath,
    ts: program ? {
      program,
      sourceFile: program.getSourceFile(filePath) || fail(`Cannot retrieve source file ${filePath} from compiled TypeScript sources.`)
    } : undefined
  }
}

export function parseFile (filePath: string) {
  debugFile(`Start parsing file ${filePath}`)
  const queries: Query[] = []
  const tableSchemas: TableSchema[] = []

  const sourceFile = instantiateSourceFile(filePath)

  const ast = parse(sourceFile.fileContent, {
    filename: filePath,
    plugins: sourceFile.ts ? ["@babel/plugin-transform-typescript"] : [],
    sourceType: "unambiguous"
  })

  traverse(ast as any, {
    CallExpression (path) {
      const callee = path.get("callee")
      if (!callee.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(callee, "defineTable")
      if (!importSpecifier) return

      tableSchemas.push(parseTableDefinition(path, sourceFile))
    },
    TaggedTemplateExpression (path) {
      const tag = path.get("tag")
      if (!tag.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(tag, "sql")
      if (!importSpecifier) return

      queries.push(parseQuery(path.get("quasi"), sourceFile))
    }
  })

  debugFile(`Parsed file ${filePath}:`)

  for (const query of queries) {
    const formattedColumnRefs = query.referencedColumns.map(col => "tableName" in col ? `${col.tableName}.${col.columnName}` : col.columnName)
    debugQueries(`  Query: ${query.query}\n    Referenced columns: ${formattedColumnRefs.join(", ")}`)
  }
  for (const table of tableSchemas) {
    debugTables(`  Table: ${table.tableName}\n    Columns: ${table.columnNames.join(", ")}`)
  }

  return {
    queries,
    tableSchemas
  }
}
