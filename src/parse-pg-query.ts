import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import * as QueryParser from "pg-query-parser"
import { augmentFileValidationError, augmentQuerySyntaxError } from "./errors"
import {
  createQueryNodePath,
  findParentQueryStatement,
  getNodeType,
  traverseSubTree,
  traverseQuery,
  QueryNodePath
} from "./query-parser-utils"
import { ColumnReference, Query, SourceFile, TableReference } from "./types"
import { getProperties } from "./typescript/objectish"

interface ExpressionSpreadTypes {
  [paramID: number]: ReturnType<typeof getProperties> | null
}

const isColumnRef = (node: QueryParser.QueryNode<any>): node is QueryParser.ColumnRef =>
  "ColumnRef" in node
const isParamRef = (node: QueryParser.QueryNode<any>): node is QueryParser.ParamRef =>
  "ParamRef" in node
const isPgString = (node: QueryParser.QueryNode<any>): node is QueryParser.PgString =>
  "String" in node
const isRelationRef = (node: QueryParser.QueryNode<any>): node is QueryParser.RelationRef =>
  "RangeVar" in node
const isResTarget = (node: QueryParser.QueryNode<any>): node is QueryParser.ResTarget =>
  "ResTarget" in node

function filterDuplicateTableRefs(tableRefs: TableReference[]) {
  return tableRefs.reduce(
    (filtered, ref) =>
      filtered.find(someRef => JSON.stringify(someRef) === JSON.stringify(ref))
        ? filtered
        : [...filtered, ref],
    [] as TableReference[]
  )
}

export function parsePostgresQuery(
  queryString: string,
  path: NodePath<types.TemplateLiteral>,
  sourceFile: SourceFile
) {
  const result = QueryParser.parse(queryString)

  if (result.error) {
    const error = new Error(`Syntax error in SQL query.\nSubstituted query: ${queryString.trim()}`)
    const query: Query = {
      query: queryString,
      referencedColumns: [],
      referencedTables: [],
      sourceMap: path.node.loc
        ? [
            {
              sourceLocation: path.node.loc,
              queryStartIndex: 0,
              queryEndIndex: queryString.length - 1
            }
          ]
        : [],
      sourceFile
    }
    throw augmentFileValidationError(augmentQuerySyntaxError(error, result.error, query), query)
  }

  return result.query[0]
}

export function getTableReferences(
  statementPath: QueryNodePath<any>,
  includeSubQueries: boolean
): Array<QueryNodePath<QueryParser.RelationRef>> {
  const referencedTables: Array<QueryNodePath<QueryParser.RelationRef>> = []

  traverseSubTree(statementPath.node, statementPath.ancestors, path => {
    const { node } = path
    if (isRelationRef(node)) {
      referencedTables.push(path)
    } else if (!includeSubQueries) {
      if (node !== statementPath.node && path.type.endsWith("Stmt")) return false
    }
  })

  return referencedTables
}

function resolveTableName(
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

export function getReferencedColumns(
  parsedQuery: QueryParser.Query,
  spreadTypes: ExpressionSpreadTypes
): ColumnReference[] {
  const referencedColumns: ColumnReference[] = []

  traverseQuery(parsedQuery, path => {
    const spreadType = isParamRef(path.node) ? spreadTypes[path.node.ParamRef.number] : null

    if (isColumnRef(path.node)) {
      const { fields } = path.node.ColumnRef
      const statement = findParentQueryStatement(path) || createQueryNodePath(parsedQuery, [])
      const relationRefs = getTableReferences(statement, false)

      if (fields.length === 1) {
        const [columnNode] = fields
        if (isPgString(columnNode)) {
          // Ignore `*` column references, since there is nothing to validate
          const tableRefsInScope: TableReference[] = relationRefs.map(ref => ({
            as: ref.node.RangeVar.alias ? ref.node.RangeVar.alias.Alias.aliasname : undefined,
            tableName: ref.node.RangeVar.relname,
            path
          }))
          referencedColumns.push({
            tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
            columnName: columnNode.String.str,
            path
          })
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
          // Ignore `table.*` column references, since there is nothing to validate
          referencedColumns.push({
            tableName: resolveTableName(tableNode.String.str, relationRefs),
            columnName: columnNode.String.str,
            path
          })
        }
      } else {
        throw new Error(
          `Expected column reference to be of format <table>.<column> or <column>. Got: ${fields.join(
            "."
          )}`
        )
      }
    } else if (isResTarget(path.node) && path.node.ResTarget.name) {
      const statement = findParentQueryStatement(path) || createQueryNodePath(parsedQuery, [])
      const relationRefs = getTableReferences(statement, false)

      const tableRefsInScope: TableReference[] = relationRefs.map(ref => ({
        as: ref.node.RangeVar.alias ? ref.node.RangeVar.alias.Alias.aliasname : undefined,
        tableName: ref.node.RangeVar.relname,
        path
      }))
      referencedColumns.push({
        tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
        columnName: path.node.ResTarget.name,
        path
      })
    } else if (spreadType) {
      const placeholderSelectStmt = findParentQueryStatement(path)
      if (!placeholderSelectStmt || !placeholderSelectStmt.node.SelectStmt) {
        throw new Error(
          `Internal invariant violation: Expected spread expression in SQL template to be substituted by a 'SELECT $1'.\n` +
            `No parent SELECT statement found, though.`
        )
      }

      const statement =
        findParentQueryStatement(placeholderSelectStmt) || createQueryNodePath(parsedQuery, [])
      const relationRefs = getTableReferences(statement, false)

      const tableRefsInScope: TableReference[] = relationRefs.map(ref => ({
        as: ref.node.RangeVar.alias ? ref.node.RangeVar.alias.Alias.aliasname : undefined,
        tableName: ref.node.RangeVar.relname,
        path
      }))

      for (const spreadArgKey of Object.keys(spreadType)) {
        referencedColumns.push({
          tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
          columnName: spreadArgKey,
          path
        })
      }
    }
  })
  return referencedColumns
}
