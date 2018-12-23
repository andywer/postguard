import ts from "typescript"

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

export function getNodeAtPosition(
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
