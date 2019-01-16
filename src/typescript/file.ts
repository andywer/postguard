import * as types from "@babel/types"
import ts from "typescript"
import { createSourceFileDiagnostic, reportDiagnostic, DiagnosticType } from "../diagnostics"
import { SourceFile } from "../types"

export function compileFiles(filePaths: string[]) {
  return ts.createProgram({
    rootNames: filePaths,
    options: {
      noEmit: true,
      skipLibCheck: true,
      strict: false
    }
  })
}

function getNodeAtPosition(
  nodeToSearch: ts.Node,
  startPosition: number,
  endPosition: number
): ts.Node | null {
  let resultNode: ts.Node | null = null

  ts.forEachChild(nodeToSearch, node => {
    if (node.pos === startPosition && node.end === endPosition) {
      resultNode = node
      return true
    } else if (node.pos <= startPosition && node.end >= endPosition) {
      const recursionResult = getNodeAtPosition(node, startPosition, endPosition)
      if (recursionResult) {
        resultNode = recursionResult
        return true
      }
    }
    if (node.pos > startPosition) {
      return true
    }
  })

  return resultNode
}

export function resolveTypeOfBabelPath(
  babelNode: types.Node,
  program: ts.Program,
  source: ts.SourceFile,
  sourceFile: SourceFile
) {
  if (!babelNode.start || !babelNode.end) {
    const message =
      `Could not match SQL template string expression node between Babel and TypeScript parser. Skipping type checking of this expression.\n` +
      `  File: ${source.fileName}`
    reportDiagnostic(
      createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, babelNode.loc)
    )
    return null
  }

  const node = getNodeAtPosition(source, babelNode.start, babelNode.end) as ts.Expression

  if (!node) {
    const message =
      `Could not match SQL template string expression node between Babel and TypeScript parser. Skipping type checking of this expression.\n` +
      `  Template expression: ${source.getText().substring(babelNode.start, babelNode.end)}`
    reportDiagnostic(
      createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, babelNode.loc)
    )
    return null
  }

  const checker = program.getTypeChecker()
  const type = checker.getTypeAtLocation(node)

  if (!type) {
    const message =
      `Could not resolve TypeScript type for SQL template string expression. Skipping type checking of this expression.\n` +
      `  Template expression: ${source.getText().substring(babelNode.start, babelNode.end)}`
    reportDiagnostic(
      createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, babelNode.loc)
    )
    return null
  }

  return type
}
