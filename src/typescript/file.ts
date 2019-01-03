import * as types from "@babel/types"
import ts from "typescript"
import * as format from "../format"

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
  source: ts.SourceFile
) {
  if (!babelNode.start || !babelNode.end) {
    console.warn(
      format.warning(
        `Warning: Could not match SQL template string expression node between Babel and TypeScript parser. Skipping type checking of this expression.\n` +
          `  File: ${source.fileName}`
      )
    )
    return null
  }

  const node = getNodeAtPosition(source, babelNode.start, babelNode.end) as ts.Expression

  if (!node) {
    console.warn(
      format.warning(
        `Warning: Could not match SQL template string expression node between Babel and TypeScript parser. Skipping type checking of this expression.\n` +
          `  File: ${source.fileName}\n` +
          `  Template expression: ${source.getText().substring(babelNode.start, babelNode.end)}`
      )
    )
    return null
  }

  const checker = program.getTypeChecker()
  const type = checker.getTypeAtLocation(node)

  if (!type) {
    console.warn(
      format.warning(
        `Warning: Could not resolve TypeScript type for SQL template string expression. Skipping type checking of this expression.\n` +
          `  File: ${source.fileName}\n` +
          `  Template expression: ${source.getText().substring(babelNode.start, babelNode.end)}`
      )
    )
    return null
  }

  return type
}
