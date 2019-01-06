import createDebugLogger from "debug"
import { ColumnDescriptor } from "squid"
import { getAllSubqueries } from "./utils"
import { ColumnReference, SourceFile } from "./types"
import { loadSourceFile, parseSourceFile as parseSourceFileUsingBabel } from "./babel/parse-file"

export { loadSourceFile }

const debugFile = createDebugLogger("pg-lint:file")
const debugQueries = createDebugLogger("pg-lint:query")
const debugSubqueries = createDebugLogger("pg-lint:subquery")
const debugTables = createDebugLogger("pg-lint:table")

function formatColumnRefs(columnRefs: ColumnReference[]): string {
  const formattedColumnRefs = columnRefs.map(col =>
    "tableName" in col ? `${col.tableName}.${col.columnName}` : col.columnName
  )
  return formattedColumnRefs.length > 0 ? formattedColumnRefs.join(", ") : "-"
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

export function parseSourceFile(sourceFile: SourceFile) {
  debugFile(`Start parsing file ${sourceFile.filePath}`)
  const { queries, tableSchemas } = parseSourceFileUsingBabel(sourceFile)

  debugFile(`Parsed file ${sourceFile.filePath}:`)

  for (const invocation of queries) {
    const query = invocation.query
    debugQueries(
      `  Query: ${query.query.trim()}\n` +
        `    Result columns: ${formatColumnRefs(query.returnedColumns)}\n` +
        `    Referenced columns: ${formatColumnRefs(query.referencedColumns)}`
    )

    for (const subquery of getAllSubqueries(query)) {
      const returningStatus = subquery.returnsIntoParentQuery ? " (into parent query)" : ""
      debugSubqueries(
        `    Subquery type: ${subquery.path.type}\n` +
          `      Result columns: ${formatColumnRefs(
            subquery.returnedColumns
          )}${returningStatus}\n` +
          `      Referenced columns: ${formatColumnRefs(subquery.referencedColumns)}`
      )
    }
  }

  for (const table of tableSchemas) {
    debugTables(`  Table: ${table.tableName}`)
    for (const columnName of table.columnNames) {
      const columnType = stringifyColumnType(table.columnDescriptors[columnName])
      debugTables(`    Column "${columnName}": ${columnType}`)
    }
  }

  return { queries, tableSchemas }
}
