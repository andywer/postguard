import { Query, QueryNode } from "pg-query-parser"
import * as util from "util"

export interface QueryNodePath<Node extends QueryNode<any>> {
  ancestors: QueryNodePath<any>[],
  node: Node,
  type: Node extends QueryNode<infer NodeType> ? NodeType : string
}

export function getNodeType<NodeType extends string> (node: QueryNode<NodeType>): NodeType {
  const topLevelKeys = Object.keys(node)

  if (topLevelKeys.length !== 1) {
    throw new Error(
      `Expected object to be a node and thus have one property with key=<node-type> only. Got keys: ${topLevelKeys.join(", ")}\n` +
      `Node: ${util.inspect(node)}`
    )
  }

  return topLevelKeys[0] as NodeType
}

export function createQueryNodePath<Node extends QueryNode<any>> (node: Node, ancestors: QueryNodePath<any>[]): QueryNodePath<Node> {
  return {
    ancestors,
    node,
    type: getNodeType(node)
  }
}

type TraversalCallback = (path: QueryNodePath<any>) => false | void

function traverseArray (array: any[], ancestors: QueryNodePath<any>[], callback: TraversalCallback) {
  for (const item of array) {
    if (!item) continue

    if (Array.isArray(item)) {
      traverseArray(item, ancestors, callback)
    } else {
      traverseSubTree(item, ancestors, callback)
    }
  }
}

export function traverseSubTree (node: QueryNode<any>, ancestors: QueryNodePath<any>[], callback: TraversalCallback) {
  const path = createQueryNodePath(node, ancestors)

  const callbackResult = callback(path)
  if (callbackResult === false) return

  for (const key of Object.keys((node as any)[path.type])) {
    const propValue = (node as any)[path.type][key]

    if (Array.isArray(propValue)) {
      traverseArray(propValue, [...ancestors, path], callback)
    } else if (propValue && typeof propValue === "object") {
      traverseSubTree(propValue, [...ancestors, path], callback)
    }
  }
}

export function traverseQuery (query: Query, callback: TraversalCallback) {
  return traverseSubTree(query, [], callback)
}

// Parent SELECT | INSERT | ... node path
export function findParentQueryStatement (path: QueryNodePath<any>) {
  for (const ancestor of [...path.ancestors].reverse()) {
    if (ancestor.type.endsWith("Stmt")) {
      return ancestor
    }
  }
  return null
}
