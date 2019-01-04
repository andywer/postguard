import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import * as ts from "typescript"
import { getReferencedNamedImport } from "./babel-imports"
import * as format from "./format"
import { createQueryNodePath } from "./query-parser-utils"
import { getReferencedColumns, getTableReferences, parsePostgresQuery } from "./parse-pg-query"
import { Query, QuerySourceMapSpan, SourceFile } from "./types"
import { getNodeAtPosition } from "./typescript/file"
import { getProperties } from "./typescript/objectish"

interface ExpressionSpreadTypes {
  [paramID: number]: ReturnType<typeof getProperties> | null
}

function isSpreadCallExpression(
  expression: NodePath<any>,
  fnName: "spreadAnd" | "spreadInsert"
): expression is NodePath<types.CallExpression> {
  if (!expression.isCallExpression()) return false

  const callee = expression.get("callee")
  if (!callee.isIdentifier()) return false

  const importSpecifier = getReferencedNamedImport(callee, fnName)
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
  const type = checker.getTypeAtLocation(node)

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

export function parseQuery(path: NodePath<types.TemplateLiteral>, sourceFile: SourceFile): Query {
  const expressions = path.get("expressions")
  const textPartials = path.get("quasis").map(quasi => quasi.node)

  const expressionSpreadTypes: ExpressionSpreadTypes = {}
  const sourceMap: QuerySourceMapSpan[] = []
  let templatedQueryString: string = ""

  const addToQueryString = (
    node: types.Node,
    queryStringPartial: string,
    isTemplateExpression?: boolean
  ) => {
    if (node.loc) {
      sourceMap.push({
        isTemplateExpression,
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

    const placeholder = isSpreadCallExpression(expression, "spreadInsert")
      ? `SELECT \$${paramNumber}`
      : `\$${paramNumber}`
    templatedQueryString = addToQueryString(expression.node, placeholder, true)

    if (sourceFile.ts && isSpreadCallExpression(expression, "spreadInsert")) {
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
