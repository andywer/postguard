import * as QueryParser from "pg-query-parser"
import { ColumnReference, TableReference } from "../types"
import { createQueryNodeSubpath, QueryNodePath } from "./query-traversal"
import { getNodeType, isColumnRef, isPgString, isStar } from "./pg-node-types"

export function filterDuplicateTableRefs(tableRefs: TableReference[]) {
  return tableRefs.reduce(
    (filtered, ref) =>
      filtered.find(someRef => JSON.stringify(someRef) === JSON.stringify(ref))
        ? filtered
        : [...filtered, ref],
    [] as TableReference[]
  )
}

export function resolveTableName(
  tableIdentifier: string,
  tableRefs: Array<QueryNodePath<QueryParser.RelationRef>>
): string {
  const matchingTableRef = tableRefs.find(tableRef => {
    const refNode = tableRef.node
    return refNode.RangeVar.alias
      ? refNode.RangeVar.alias.Alias.aliasname === tableIdentifier
      : refNode.RangeVar.relname === tableIdentifier
  })

  if (matchingTableRef) {
    return matchingTableRef.node.RangeVar.relname
  } else {
    throw new Error(`No matching table reference found for "${tableIdentifier}".`)
  }
}

export function resolveColumnReference(
  path: QueryNodePath<QueryParser.ColumnRef>,
  relationRefs: Array<QueryNodePath<QueryParser.RelationRef>>
): ColumnReference | null {
  const { fields } = path.node.ColumnRef

  if (fields.length === 1) {
    const [columnNode] = fields
    if (isPgString(columnNode)) {
      const tableRefsInScope: TableReference[] = relationRefs.map(ref => ({
        as: ref.node.RangeVar.alias ? ref.node.RangeVar.alias.Alias.aliasname : undefined,
        tableName: ref.node.RangeVar.relname,
        path
      }))
      return {
        tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
        columnName: columnNode.String.str,
        path
      }
    } else if (isStar(columnNode)) {
      if (relationRefs.length !== 1) {
        throw new Error(
          `Can only have unqualified * selector if only one table is referenced in the (sub-)query.\n` +
            `Tables in scope: ${
              relationRefs.length === 0
                ? "(none)"
                : relationRefs.map(ref => ref.node.RangeVar.relname)
            }`
        )
      }
      const tableRef = relationRefs[0]
      return {
        tableName: tableRef.node.RangeVar.alias
          ? tableRef.node.RangeVar.alias.Alias.aliasname
          : tableRef.node.RangeVar.relname,
        columnName: "*",
        path
      }
    }
  } else if (fields.length === 2) {
    const [tableNode, columnNode] = fields
    if (!isPgString(tableNode)) {
      throw new Error(
        `Expected first identifier in column reference to be a string. Got ${getNodeType(
          tableNode
        )}`
      )
    }
    if (isPgString(columnNode)) {
      return {
        tableName: resolveTableName(tableNode.String.str, relationRefs),
        columnName: columnNode.String.str,
        path
      }
    } else if (isStar(columnNode)) {
      return {
        tableName: resolveTableName(tableNode.String.str, relationRefs),
        columnName: "*",
        path
      }
    }
  } else {
    throw new Error(
      `Expected column reference to be of format <table>.<column> or <column>. Got: ${fields.join(
        "."
      )}`
    )
  }

  return null
}

export function resolveResTarget(
  path: QueryNodePath<QueryParser.ResTarget>,
  relationRefs: Array<QueryNodePath<QueryParser.RelationRef>>
): ColumnReference | null {
  const { name, val } = path.node.ResTarget

  if (name) {
    const tableRefsInScope: TableReference[] = relationRefs.map(ref => ({
      as: ref.node.RangeVar.alias ? ref.node.RangeVar.alias.Alias.aliasname : undefined,
      tableName: ref.node.RangeVar.relname,
      path
    }))
    return {
      tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
      columnName: name,
      path
    }
  } else if (isColumnRef(val)) {
    return resolveColumnReference(createQueryNodeSubpath(path, val, "val"), relationRefs)
  } else {
    return null
  }
}
