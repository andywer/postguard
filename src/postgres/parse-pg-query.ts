import * as QueryParser from "pg-query-parser"
import { createQueryDiagnostic, reportDiagnostic, DiagnosticType } from "../diagnostics"
import { ColumnReference, Query, SourceFile, TableReference, QuerySourceMapSpan } from "../types"
import { resolvePropertyTypes } from "../typescript/objectish"
import { placeholderColumnName } from "../utils"
import {
  createQueryNodePath,
  createQueryNodeSubpath,
  getQueryPathParent,
  traverseSubTree,
  QueryNodePath
} from "./query-traversal"
import {
  filterDuplicateTableRefs,
  resolveColumnReference,
  resolveResTarget
} from "./resolve-references"
import {
  getNodeType,
  isColumnRef,
  isCommonTableExpr,
  isParamRef,
  isRelationRef,
  isResTarget,
  isSelectStmt
} from "./pg-node-types"

interface ExpressionSpreadTypes {
  [paramID: number]: ReturnType<typeof resolvePropertyTypes> | null
}

interface QueryContext {
  expressionSpreadTypes: ExpressionSpreadTypes
  query: string
  sourceFile: SourceFile
  sourceMap: QuerySourceMapSpan[]
}

const $any = Symbol("any")

export const spreadTypeAny: ReturnType<typeof resolvePropertyTypes> = Object.defineProperty(
  {},
  $any,
  {
    enumerable: false,
    value: true
  }
)

const isPlaceholderSelect = (node: QueryParser.QueryNode<any>) =>
  isSelectStmt(node) &&
  !node.SelectStmt.fromClause &&
  node.SelectStmt.targetList &&
  node.SelectStmt.targetList.length === 1 &&
  isResTarget(node.SelectStmt.targetList[0]) &&
  isParamRef(node.SelectStmt.targetList[0].ResTarget.val)

const isSubquery = (node: QueryParser.QueryNode<any>) =>
  getNodeType(node).endsWith("Stmt") && !isPlaceholderSelect(node)

const isReturningIntoParentQuery = (path: QueryNodePath<QueryParser.QueryNode<any>>) =>
  ["larg", "rarg", "selectStmt"].indexOf(path.parentPropKey) > -1

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
      const relationRefs = getTableReferences(statement, false)
      const columnRef = resolveColumnReference(path, relationRefs)

      if (columnRef && columnRef.columnName !== placeholderColumnName) {
        referencedColumns.push(columnRef)
      }
    } else if (isResTarget(path.node) && path.node.ResTarget.name) {
      const relationRefs = getTableReferences(statement, false)
      const columnRef = resolveResTarget(path, relationRefs)

      if (columnRef && columnRef.columnName !== placeholderColumnName) {
        referencedColumns.push(columnRef)
      }
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

      if (spreadType === spreadTypeAny || !spreadType) {
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

function getReturningColumns(statement: QueryNodePath<QueryParser.Query>): ColumnReference[] {
  const body = (statement.node as any)[statement.type]

  const relationRefs = getTableReferences(statement, false)
  const { returningList = [], targetList = [] } = body

  const resTargets: QueryParser.ResTarget[] = [...returningList, ...targetList].filter(
    node => getNodeType(node) === "ResTarget"
  )

  return resTargets
    .map(resTarget => {
      const propKey = returningList.indexOf(resTarget) > -1 ? "returningList" : "targetList"
      const resTargetPath = createQueryNodeSubpath(statement, resTarget, propKey)
      return resolveResTarget(resTargetPath, relationRefs)
    })
    .filter((ref): ref is ColumnReference => ref !== null)
}

function instantiateQuery(path: QueryNodePath<QueryParser.Query>, context: QueryContext): Query {
  const referencedColumns = getReferencedColumns(path, context.expressionSpreadTypes)
  const referencedTables = getTableReferences(path, true).map(tableRef => ({
    tableName: tableRef.node.RangeVar.relname,
    path: tableRef
  }))

  const returnedColumns = getReturningColumns(path)

  const subqueries: Query[] = getSubqueries(path).map(subqueryPath =>
    instantiateQuery(subqueryPath, context)
  )
  const type = getNodeType(path.node)
    .replace(/Stmt$/, "")
    .toUpperCase()

  const parent = getQueryPathParent(path)
  const exposedAsTable =
    parent && isCommonTableExpr(parent.node) ? parent.node.CommonTableExpr.ctename : undefined

  return {
    type,
    path,
    exposedAsTable,
    referencedColumns,
    referencedTables,
    returnedColumns,
    returnsIntoParentQuery: isReturningIntoParentQuery(path),
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
    const fakePath = createQueryNodePath({ SelectStmt: { op: 0 } }, [], "")
    const query = instantiateQuery(fakePath, context)
    const message = `Syntax error in SQL query.\nSubstituted query: ${queryString.trim()}`
    reportDiagnostic(
      createQueryDiagnostic(DiagnosticType.error, message, query, result.error.cursorPosition - 1)
    )
    return query
  }

  const parsedQuery = result.query[0]
  const queryPath = createQueryNodePath(parsedQuery, [], "")

  return instantiateQuery(queryPath, context)
}
