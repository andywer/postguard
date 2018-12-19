import { parse, traverse } from "@babel/core"
import createDebugLogger from "debug"
import * as fs from "fs"
import { getReferencedNamedImport } from "./babel-parser-utils"
import { parseQuery, Query } from "./parse-query"
import { parseTableDefinition, TableSchema } from "./parse-table-definition"

export {
  Query,
  TableSchema
}

const debugFile = createDebugLogger("pg-lint:file")
const debugQueries = createDebugLogger("pg-lint:query")
const debugTables = createDebugLogger("pg-lint:table")

export function parseFile (filePath: string) {
  debugFile(`Start parsing file ${filePath}`)
  const queries: Query[] = []
  const tableSchemas: TableSchema[] = []

  const isTypescript = filePath.endsWith(".ts")
  const content = fs.readFileSync(filePath, "utf8")

  const ast = parse(content, {
    filename: filePath,
    plugins: isTypescript ? ["@babel/plugin-transform-typescript"] : [],
    sourceType: "unambiguous"
  })

  traverse(ast as any, {
    CallExpression (path) {
      const callee = path.get("callee")
      if (!callee.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(callee)
      if (!importSpecifier) return

      if (importSpecifier.node.name === "defineTable") {
        tableSchemas.push(parseTableDefinition(path, filePath))
      }
    },
    TaggedTemplateExpression (path) {
      const tag = path.get("tag")
      if (!tag.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(tag)
      if (!importSpecifier) return

      if (importSpecifier.node.name === "sql") {
        queries.push(parseQuery(path.get("quasi"), filePath))
      }
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
