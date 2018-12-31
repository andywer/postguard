import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import * as QueryParser from "pg-query-parser"
import { augmentFileValidationError, augmentQuerySyntaxError } from "./errors"
import {
  createQueryNodePath,
  getNodeType,
  getStatementReturningColumns,
  traverseSubTree,
  QueryNodePath
} from "./query-parser-utils"
import { ColumnReference, Query, SourceFile, TableReference, QuerySourceMapSpan } from "./types"
import { getProperties } from "./typescript/objectish"

interface ExpressionSpreadTypes {
  [paramID: number]: ReturnType<typeof getProperties> | null
}

interface QueryContext {
  expressionSpreadTypes: ExpressionSpreadTypes
  query: string
  sourceFile: SourceFile
  sourceMap: QuerySourceMapSpan[]
}

const $any = Symbol("any")

export const spreadTypeAny: ReturnType<typeof getProperties> = Object.defineProperty({}, $any, {
  enumerable: false,
  value: true
})

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
const isSelectStmt = (node: QueryParser.QueryNode<any>): node is QueryParser.SelectStmt =>
  "SelectStmt" in node

const isPlaceholderSelect = (node: QueryParser.QueryNode<any>) =>
  isSelectStmt(node) &&
  !node.SelectStmt.fromClause &&
  node.SelectStmt.targetList &&
  node.SelectStmt.targetList.length === 1 &&
  isResTarget(node.SelectStmt.targetList[0]) &&
  isParamRef(node.SelectStmt.targetList[0].ResTarget.val)

const isSubquery = (node: QueryParser.QueryNode<any>) =>
  getNodeType(node).endsWith("Stmt") && !isPlaceholderSelect(node)

function filterDuplicateTableRefs(tableRefs: TableReference[]) {
  return tableRefs.reduce(
    (filtered, ref) =>
      filtered.find(someRef => JSON.stringify(someRef) === JSON.stringify(ref))
        ? filtered
        : [...filtered, ref],
    [] as TableReference[]
  )
}

function getSubqueries(
  statementPath: QueryNodePath<QueryParser.Query>
): Array<QueryNodePath<QueryParser.Query>> {
  const subqueries: Array<QueryNodePath<QueryParser.Query>> = []

  traverseSubTree(statementPath, (path, $cancelRecursion) => {
    if (path.node === statementPath.node) return

    if (isSubquery(path.node)) {
      subqueries.push(path)
      return $cancelRecursion
    }
  })

  return subqueries
}

function getTableReferences(
  statementPath: QueryNodePath<any>,
  includeSubQueries: boolean
): Array<QueryNodePath<QueryParser.RelationRef>> {
  const referencedTables: Array<QueryNodePath<QueryParser.RelationRef>> = []

  traverseSubTree(statementPath, (path, $cancelRecursion) => {
    const { node } = path
    if (isRelationRef(node)) {
      referencedTables.push(path)
    } else if (!includeSubQueries) {
      if (node !== statementPath.node && isSubquery(node)) return $cancelRecursion
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

function getReferencedColumns(
  statement: QueryNodePath<QueryParser.Query>,
  spreadTypes: ExpressionSpreadTypes
): ColumnReference[] {
  const referencedColumns: ColumnReference[] = []

  traverseSubTree(statement, (path, $cancelRecursion) => {
    const spreadType = isParamRef(path.node) ? spreadTypes[path.node.ParamRef.number] : null

    if (path.node === statement.node) return
    if (isSubquery(path.node)) return $cancelRecursion

    if (isColumnRef(path.node)) {
      const { fields } = path.node.ColumnRef
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

      if (spreadType === spreadTypeAny) {
        referencedColumns.push({
          any: true,
          tableRefsInScope: filterDuplicateTableRefs(tableRefsInScope),
          columnName: "",
          path
        })
      }
    }
  })
  return referencedColumns
}

function instantiateQuery(path: QueryNodePath<QueryParser.Query>, context: QueryContext) {
  const referencedColumns = getReferencedColumns(path, context.expressionSpreadTypes)
  const referencedTables = getTableReferences(path, true).map(tableRef => ({
    tableName: tableRef.node.RangeVar.relname,
    path: tableRef
  }))

  const returnedColumns: string[] = getStatementReturningColumns(path.node)
    .map(resTarget => resTarget.ResTarget.name)
    .filter(name => !!name) as string[]

  const subqueries: Query[] = getSubqueries(path).map(subqueryPath =>
    instantiateQuery(subqueryPath, context)
  )
  const type = getNodeType(path.node)
    .replace(/Stmt$/, "")
    .toUpperCase()

  return {
    type,
    path,
    referencedColumns,
    referencedTables,
    returnedColumns,
    query: context.query,
    sourceFile: context.sourceFile,
    sourceMap: context.sourceMap,
    subqueries
  }
}

export function parsePostgresQuery(
  queryString: string,
  sourceFile: SourceFile,
  sourceMap: QuerySourceMapSpan[],
  spreadTypes: ExpressionSpreadTypes
): Query {
  const context: QueryContext = {
    expressionSpreadTypes: spreadTypes,
    query: queryString,
    sourceFile,
    sourceMap
  }
  const result = QueryParser.parse(queryString)

  if (result.error) {
    const fakePath = createQueryNodePath({ SelectStmt: { op: 0 } }, [])
    const query = instantiateQuery(fakePath, context)
    const error = new Error(`Syntax error in SQL query.\nSubstituted query: ${queryString.trim()}`)
    throw augmentFileValidationError(augmentQuerySyntaxError(error, result.error, query), query)
  }

  const parsedQuery = result.query[0]
  const queryPath = createQueryNodePath(parsedQuery, [])

  return instantiateQuery(queryPath, context)
}
