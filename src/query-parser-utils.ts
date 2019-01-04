import { QueryNode } from "pg-query-parser"
import * as util from "util"

export interface QueryNodePath<Node extends QueryNode<any>> {
  ancestors: Array<QueryNodePath<any>>
  node: Node
  parentPropKey: string
  type: Node extends QueryNode<infer NodeType> ? NodeType : string
}

const $cancelToken = Symbol("cancel")

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
  ancestors: Array<QueryNodePath<any>>,
  parentPropKey: string
): QueryNodePath<Node> {
  return {
    ancestors,
    node,
    parentPropKey,
    type: getNodeType(node)
  }
}

export function createQueryNodeSubpath<Node extends QueryNode<any>>(
  path: QueryNodePath<QueryNode<any>>,
  subNode: Node,
  parentPropKey: string
): QueryNodePath<Node> {
  return {
    ancestors: [...path.ancestors, path],
    node: subNode,
    parentPropKey,
    type: getNodeType(subNode)
  }
}

type TraversalCallback = (path: QueryNodePath<any>, cancelRecursionToken: symbol) => symbol | void

function traverseArray(
  path: QueryNodePath<QueryNode<any>>,
  array: any[],
  parentPropKey: string,
  callback: TraversalCallback
) {
  for (const item of array) {
    if (!item) continue

    if (Array.isArray(item)) {
      traverseArray(path, item, parentPropKey, callback)
    } else {
      const itemPath = createQueryNodeSubpath(path, item, parentPropKey)
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
      traverseArray(path, propValue, key, callback)
    } else if (propValue && typeof propValue === "object") {
      const propPath = createQueryNodeSubpath(path, propValue, key)
      traverseSubTree(propPath, callback)
    }
  }
}

export function getQueryPathParent(
  path: QueryNodePath<QueryNode<any>>
): QueryNodePath<QueryNode<any>> | null {
  return path.ancestors.length >= 1 ? path.ancestors[path.ancestors.length - 1] : null
}
