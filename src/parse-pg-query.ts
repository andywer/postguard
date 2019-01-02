import * as QueryParser from "pg-query-parser"
import { augmentFileValidationError, augmentQuerySyntaxError } from "./errors"
import {
  createQueryNodePath,
  createQueryNodeSubpath,
  getNodeType,
  getQueryPathParent,
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
const isCommonTableExpr = (node: QueryParser.QueryNode<any>): node is QueryParser.CommonTableExpr =>
  "CommonTableExpr" in node
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
const isStar = (node: QueryParser.QueryNode<any>): node is QueryParser.PgStar => "A_Star" in node

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

function resolveColumnReference(
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

function resolveResTarget(
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

      if (columnRef) {
        referencedColumns.push(columnRef)
      }
    } else if (isResTarget(path.node) && path.node.ResTarget.name) {
      const relationRefs = getTableReferences(statement, false)
      const columnRef = resolveResTarget(path, relationRefs)

      if (columnRef) {
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

export function getStatementReturningColumns(
  statement: QueryNodePath<QueryParser.Query>
): ColumnReference[] {
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

  const returnedColumns = getStatementReturningColumns(path)

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
    const error = new Error(`Syntax error in SQL query.\nSubstituted query: ${queryString.trim()}`)
    throw augmentFileValidationError(augmentQuerySyntaxError(error, result.error, query), query)
  }

  const parsedQuery = result.query[0]
  const queryPath = createQueryNodePath(parsedQuery, [], "")

  return instantiateQuery(queryPath, context)
}
