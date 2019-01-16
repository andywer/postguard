import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import * as ts from "typescript"
import { getReferencedNamedImport } from "./babel-imports"
import { createSourceFileDiagnostic, reportDiagnostic, DiagnosticType } from "../diagnostics"
import { parsePostgresQuery, spreadTypeAny } from "../postgres/parse-pg-query"
import { Query, QuerySourceMapSpan, SourceFile } from "../types"
import { resolveTypeOfBabelPath } from "../typescript/file"
import { resolvePropertyTypes } from "../typescript/objectish"
import { placeholderColumnName } from "../utils"

interface ExpressionSpreadTypes {
  [paramID: number]: ReturnType<typeof resolvePropertyTypes>
}

function isSpreadCallExpression(
  expression: NodePath<any>,
  fnName: "spreadAnd" | "spreadInsert" | "spreadUpdate"
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
  tsSource: ts.SourceFile,
  sourceFile: SourceFile
) {
  const callee = expression.get("callee") as NodePath<types.Identifier>
  const args = expression.get("arguments")

  if (args.length === 0) {
    throw new Error(`Expected call to ${callee.node.name}() to have arguments.`)
  }

  const spreadArg = args[0]
  if (!spreadArg.node.start || !spreadArg.node.end) return null

  return resolveTypeOfBabelPath(spreadArg.node, tsProgram, tsSource, sourceFile)
}

function resolveSpreadExpressionType(expression: NodePath<types.Node>, sourceFile: SourceFile) {
  if (!sourceFile.ts) return spreadTypeAny

  if (
    isSpreadCallExpression(expression, "spreadInsert") ||
    isSpreadCallExpression(expression, "spreadUpdate")
  ) {
    const spreadArgType = resolveSpreadArgumentType(
      expression,
      sourceFile.ts.program,
      sourceFile.ts.sourceFile,
      sourceFile
    )

    const spreadType = spreadArgType
      ? resolvePropertyTypes(sourceFile.ts.program, spreadArgType)
      : null
    return spreadType || spreadTypeAny
  } else {
    return null
  }
}

function createExpressionPlaceholder(expression: NodePath<types.Expression>, paramNumber: number) {
  if (isSpreadCallExpression(expression, "spreadInsert")) {
    return `SELECT \$${paramNumber}`
  } else if (isSpreadCallExpression(expression, "spreadUpdate")) {
    return `"${placeholderColumnName}" = \$${paramNumber}`
  } else {
    return `\$${paramNumber}`
  }
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

    const placeholder = createExpressionPlaceholder(expression, paramNumber)
    templatedQueryString = addToQueryString(expression.node, placeholder, true)

    expressionSpreadTypes[paramNumber] = resolveSpreadExpressionType(expression, sourceFile)

    if (expressionSpreadTypes[paramNumber] === spreadTypeAny && sourceFile.ts) {
      const message = `Cannot infer properties of spread expression in SQL template.`
      reportDiagnostic(
        createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, expression.node.loc)
      )
    }

    if (textPartials[index + 1]) {
      templatedQueryString = addToQueryString(
        textPartials[index + 1],
        textPartials[index + 1].value.cooked
      )
    }
  }

  return parsePostgresQuery(templatedQueryString, sourceFile, sourceMap, expressionSpreadTypes)
}
