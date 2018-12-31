import { Query, QueryNode, ResTarget } from "pg-query-parser"
import * as util from "util"

const $cancelToken = Symbol("cancel")

export interface QueryNodePath<Node extends QueryNode<any>> {
  ancestors: Array<QueryNodePath<any>>
  node: Node
  type: Node extends QueryNode<infer NodeType> ? NodeType : string
}

export function getNodeType<NodeType extends string>(node: QueryNode<NodeType>): NodeType {
  const topLevelKeys = Object.keys(node)

  if (topLevelKeys.length !== 1) {
    throw new Error(
      `Expected object to be a node and thus have one property with key=<node-type> only. Got keys: ${topLevelKeys.join(
        ", "
      )}\n` + `Node: ${util.inspect(node)}`
    )
  }

  return topLevelKeys[0] as NodeType
}

export function createQueryNodePath<Node extends QueryNode<any>>(
  node: Node,
  ancestors: Array<QueryNodePath<any>>
): QueryNodePath<Node> {
  return {
    ancestors,
    node,
    type: getNodeType(node)
  }
}

type TraversalCallback = (path: QueryNodePath<any>, cancelRecursionToken: symbol) => symbol | void

function traverseArray(
  path: QueryNodePath<QueryNode<any>>,
  array: any[],
  callback: TraversalCallback
) {
  for (const item of array) {
    if (!item) continue

    if (Array.isArray(item)) {
      traverseArray(path, item, callback)
    } else {
      const itemPath = createQueryNodePath(item, [...path.ancestors, path])
      traverseSubTree(itemPath, callback)
    }
  }
}

export function traverseSubTree(path: QueryNodePath<QueryNode<any>>, callback: TraversalCallback) {
  const callbackResult = callback(path, $cancelToken)
  if (callbackResult === $cancelToken) return

  for (const key of Object.keys((path.node as any)[path.type])) {
    const propValue = (path.node as any)[path.type][key]

    if (Array.isArray(propValue)) {
      traverseArray(path, propValue, callback)
    } else if (propValue && typeof propValue === "object") {
      const propPath = createQueryNodePath(propValue, [...path.ancestors, path])
      traverseSubTree(propPath, callback)
    }
  }
}

export function getStatementReturningColumns(statement: Query): ResTarget[] {
  const type = getNodeType(statement)
  const body = (statement as any)[type]

  const { returningList = [], targetList = [] } = body
  return [...returningList, ...targetList].filter(node => getNodeType(node) === "ResTarget")
}
