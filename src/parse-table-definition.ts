import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"

// TODO: Parse column types as well
export interface TableSchema {
  tableName: string,
  columnNames: string[],
  filePath: string,
  loc: types.SourceLocation | null
}

function parseTableColumnsDefinition (path: NodePath<types.ObjectExpression>) {
  const columnNames = path.get("properties").reduce(
    (names, property) => {
      if (!property.isObjectProperty()) throw property.buildCodeFrameError("Expected object property (no spread or method).")

      const key = property.get("key")
      if (Array.isArray(key)) throw property.buildCodeFrameError("Did not expect property key to be an array.")

      if (key.isIdentifier()) {
        return [...names, key.node.name]
      } else {
        const name = key.evaluate().value
        if (!name) throw key.buildCodeFrameError("Cannot resolve property key value (column name).")
        return [...names, name]
      }
    },
    [] as string[]
  )
  return {
    columnNames
  }
}

export function parseTableDefinition (path: NodePath<types.CallExpression>, filePath: string): TableSchema {
  const args = path.get("arguments")
  if (args.length !== 2) throw path.buildCodeFrameError("Expected two arguments on defineTable() call.")

  const tableName = args[0].evaluate().value
  if (!tableName || typeof tableName !== "string") throw path.buildCodeFrameError("Expected first argument of defineTable() to be the table name.")

  const tableColumnDefs = args[1]
  if (!tableColumnDefs.isObjectExpression()) throw path.buildCodeFrameError("Second argument to defineTable() must be an object literal.")

  const { columnNames } = parseTableColumnsDefinition(tableColumnDefs)
  return {
    tableName,
    columnNames,
    filePath,
    loc: path.node.loc
  }
}
