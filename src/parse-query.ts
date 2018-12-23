import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import * as QueryParser from "pg-query-parser"
import * as ts from "typescript"
import { getReferencedNamedImport } from "./babel-parser-utils"
import { augmentFileValidationError, augmentQuerySyntaxError } from "./errors"
import * as format from "./format"
import {
  createQueryNodePath,
  findParentQueryStatement,
  getNodeType,
  traverseSubTree,
  traverseQuery,
  QueryNodePath
} from "./query-parser-utils"
import { ColumnReference, Query, QuerySourceMapSpan, SourceFile, TableReference } from "./types"
import { getNodeAtPosition } from "./typescript/file"
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

function filterDuplicateTableRefs(tableRefs: TableReference[]) {
  return tableRefs.reduce(
    (filtered, ref) =>
      filtered.find(someRef => JSON.stringify(someRef) === JSON.stringify(ref))
        ? filtered
        : [...filtered, ref],
    [] as TableReference[]
  )
}

function isSpreadInsertExpression(
  expression: NodePath<any>
): expression is NodePath<types.CallExpression> {
  if (!expression.isCallExpression()) return false

  const callee = expression.get("callee")
  if (!callee.isIdentifier()) return false

  const importSpecifier = getReferencedNamedImport(callee, "spreadInsert")
  return Boolean(importSpecifier)
}

function resolveSpreadArgumentType(
  expression: NodePath<types.CallExpression>,
  tsProgram: ts.Program,
  tsSource: ts.SourceFile
) {
  const callee = expression.get("callee") as NodePath<types.Identifier>
  const args = expression.get("arguments")

  if (args.length === 0) {
    throw new Error(`Expected call to ${callee.node.name}() to have arguments.`)
  }

  const spreadArg = args[0]
  if (!spreadArg.node.start || !spreadArg.node.end) return null

  const node = getNodeAtPosition(
    tsSource,
    spreadArg.node.start,
    spreadArg.node.end
  ) as ts.Expression

  if (!node) {
    console.warn(
      format.warning(
        `Warning: Could not match SQL template string expression node between Babel and TypeScript parser. Skipping type checking of this expression.\n` +
          `  File: ${tsSource.fileName}\n` +
          `  Template expression: ${tsSource
            .getText()
            .substring(spreadArg.node.start, spreadArg.node.end)}`
      )
    )
    return null
  }

  const checker = tsProgram.getTypeChecker()
  const type = checker.getContextualType(node)

  if (!type) {
    console.warn(
      format.warning(
        `Warning: Could not resolve TypeScript type for SQL template string expression. Skipping type checking of this expression.\n` +
          `  File: ${tsSource.fileName}\n` +
          `  Template expression: ${tsSource
            .getText()
            .substring(spreadArg.node.start, spreadArg.node.end)}`
      )
    )
    return null
  }

  return type
}

function parsePostgresQuery(
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

function getTableReferences(
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

function getReferencedColumns(
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

export function parseQuery(path: NodePath<types.TemplateLiteral>, sourceFile: SourceFile): Query {
  const expressions = path.get("expressions")
  const textPartials = path.get("quasis").map(quasi => quasi.node)

  const expressionSpreadTypes: ExpressionSpreadTypes = {}
  const sourceMap: QuerySourceMapSpan[] = []
  let templatedQueryString: string = ""

  const addToQueryString = (node: types.Node, queryStringPartial: string) => {
    if (node.loc) {
      sourceMap.push({
        sourceLocation: node.loc,
        queryStartIndex: templatedQueryString.length,
        queryEndIndex: templatedQueryString.length + queryStringPartial.length
      })
    }

    return templatedQueryString + queryStringPartial
  }

  templatedQueryString = addToQueryString(textPartials[0], textPartials[0].value.cooked)

  for (let index = 0; index < expressions.length; index++) {
    const expression = expressions[index]
    const paramNumber = index + 1

    const placeholder = isSpreadInsertExpression(expression)
      ? `SELECT \$${paramNumber}`
      : `\$${paramNumber}`
    templatedQueryString = addToQueryString(expression.node, placeholder)

    if (sourceFile.ts && isSpreadInsertExpression(expression)) {
      const spreadArgType = resolveSpreadArgumentType(
        expression,
        sourceFile.ts.program,
        sourceFile.ts.sourceFile
      )
      expressionSpreadTypes[paramNumber] = spreadArgType
        ? getProperties(sourceFile.ts.program, spreadArgType)
        : null

      if (!expressionSpreadTypes[paramNumber]) {
        const lineHint = path.node.loc ? `:${path.node.loc.start.line}` : ``
        console.warn(
          format.warning(
            `Warning: Cannot infer properties of spread expression in SQL template at ${
              sourceFile.filePath
            }${lineHint}`
          )
        )
      }
    }

    if (textPartials[index + 1]) {
      templatedQueryString = addToQueryString(
        textPartials[index + 1],
        textPartials[index + 1].value.cooked
      )
    }
  }

  const parsedQuery = parsePostgresQuery(templatedQueryString, path, sourceFile)
  const referencedColumns = getReferencedColumns(parsedQuery, expressionSpreadTypes)

  const referencedTables = getTableReferences(createQueryNodePath(parsedQuery, []), true).map(
    tableRef => ({
      tableName: tableRef.node.RangeVar.relname,
      path: tableRef
    })
  )

  return {
    referencedColumns,
    referencedTables,
    query: templatedQueryString,
    sourceFile,
    sourceMap
  }
}
