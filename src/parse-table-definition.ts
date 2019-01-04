import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import { isDescriptor, resolveColumnDescriptorExpression } from "./babel-resolver"
import { SourceFile, TableSchema } from "./types"

function parseColumnDescriptors(path: NodePath<types.ObjectExpression>) {
  const columnDescriptors: TableSchema["columnDescriptors"] = {}
  const resolved = resolveColumnDescriptorExpression(path)

  if (!resolved || typeof resolved !== "object") {
    throw path.buildCodeFrameError(
      `Statically resolved to ${typeof resolved}. Expected it to be an object.`
    )
  }

  for (const key of Object.keys(resolved)) {
    const value = resolved[key]

    if (!isDescriptor(value)) {
      throw path.buildCodeFrameError(`Expected property "${key}" to be a schema descriptor.`)
    }

    columnDescriptors[key] = value
  }

  return columnDescriptors
}

export function parseTableDefinition(
  path: NodePath<types.CallExpression>,
  sourceFile: SourceFile
): TableSchema {
  const args = path.get("arguments")
  if (args.length !== 2) {
    throw path.buildCodeFrameError("Expected two arguments on defineTable() call.")
  }

  const tableName = args[0].evaluate().value
  if (!tableName || typeof tableName !== "string") {
    throw path.buildCodeFrameError("Expected first argument of defineTable() to be the table name.")
  }

  const tableColumnDefs = args[1]
  if (!tableColumnDefs.isObjectExpression()) {
    throw path.buildCodeFrameError("Second argument to defineTable() must be an object literal.")
  }

  const columnDescriptors = parseColumnDescriptors(tableColumnDefs)

  return {
    tableName,
    columnDescriptors,
    columnNames: Object.keys(columnDescriptors),
    loc: path.node.loc,
    sourceFile
  }
}
