import { parse, traverse } from "@babel/core"
import createDebugLogger from "debug"
import * as fs from "fs"
import { ColumnDescriptor } from "squid"
import { getReferencedNamedImport } from "./babel-imports"
import { fail } from "./errors"
import { parseQuery } from "./parse-query"
import { parseTableDefinition } from "./parse-table-definition"
import { Query, SourceFile, TableSchema } from "./types"
import { compileFiles } from "./typescript/file"

export { Query, TableSchema }

const debugFile = createDebugLogger("pg-lint:file")
const debugQueries = createDebugLogger("pg-lint:query")
const debugTables = createDebugLogger("pg-lint:table")

function compileTypeScript(filePath: string) {
  try {
    return compileFiles([filePath])
  } catch (error) {
    // tslint:disable-next-line no-console
    console.error(`Compiling TypeScript source file ${filePath} failed: ${error.message}`)
  }
}

function stringifyColumnType(descriptor: ColumnDescriptor) {
  const props: string[] = [
    descriptor.hasDefault ? "default value" : null,
    descriptor.nullable ? "nullable" : null
  ].filter(str => !!str) as string[]

  const propsString = props.length > 0 ? ` (${props.join(", ")})` : ""

  if (descriptor.type === "enum" && descriptor.enum) {
    return `enum${propsString} [${descriptor.enum.map(value => `'${value}'`).join(", ")}]`
  } else {
    return `${descriptor.type}${
      descriptor.subtype ? `[${descriptor.subtype.type}]` : ""
    }${propsString}`
  }
}

export function loadSourceFile(filePath: string): SourceFile {
  const fileContent = fs.readFileSync(filePath, "utf8")
  const program = filePath.endsWith(".ts") ? compileTypeScript(filePath) : undefined

  return {
    fileContent,
    filePath,
    ts: program
      ? {
          program,
          sourceFile:
            program.getSourceFile(filePath) ||
            fail(`Cannot retrieve source file ${filePath} from compiled TypeScript sources.`)
        }
      : undefined
  }
}

export function parseSourceFile(sourceFile: SourceFile) {
  debugFile(`Start parsing file ${sourceFile.filePath}`)
  const queries: Query[] = []
  const tableSchemas: TableSchema[] = []

  const ast = parse(sourceFile.fileContent, {
    filename: sourceFile.filePath,
    plugins: sourceFile.ts ? ["@babel/plugin-transform-typescript"] : [],
    sourceType: "unambiguous"
  })

  traverse(ast as any, {
    CallExpression(path) {
      const callee = path.get("callee")
      if (!callee.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(callee, "defineTable")
      if (!importSpecifier) return

      tableSchemas.push(parseTableDefinition(path, sourceFile))
    },
    TaggedTemplateExpression(path) {
      const tag = path.get("tag")
      if (!tag.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(tag, "sql")
      if (!importSpecifier) return

      queries.push(parseQuery(path.get("quasi"), sourceFile))
    }
  })

  debugFile(`Parsed file ${sourceFile.filePath}:`)

  for (const query of queries) {
    const formattedColumnRefs = query.referencedColumns.map(col =>
      "tableName" in col ? `${col.tableName}.${col.columnName}` : col.columnName
    )
    const referencedColumns = formattedColumnRefs.length > 0 ? formattedColumnRefs.join(", ") : "-"
    debugQueries(`  Query: ${query.query.trim()}\n    Referenced columns: ${referencedColumns}`)
  }
  for (const table of tableSchemas) {
    debugTables(`  Table: ${table.tableName}`)
    for (const columnName of table.columnNames) {
      const columnType = stringifyColumnType(table.columnDescriptors[columnName])
      debugTables(`    Column "${columnName}": ${columnType}`)
    }
  }

  return {
    queries,
    tableSchemas
  }
}
