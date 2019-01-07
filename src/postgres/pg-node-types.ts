import * as QueryParser from "pg-query-parser"
import * as util from "util"

export const isColumnRef = (node: QueryParser.QueryNode<any>): node is QueryParser.ColumnRef =>
  "ColumnRef" in node
export const isCommonTableExpr = (
  node: QueryParser.QueryNode<any>
): node is QueryParser.CommonTableExpr => "CommonTableExpr" in node
export const isParamRef = (node: QueryParser.QueryNode<any>): node is QueryParser.ParamRef =>
  "ParamRef" in node
export const isPgString = (node: QueryParser.QueryNode<any>): node is QueryParser.PgString =>
  "String" in node
export const isRelationRef = (node: QueryParser.QueryNode<any>): node is QueryParser.RelationRef =>
  "RangeVar" in node
export const isResTarget = (node: QueryParser.QueryNode<any>): node is QueryParser.ResTarget =>
  "ResTarget" in node
export const isSelectStmt = (node: QueryParser.QueryNode<any>): node is QueryParser.SelectStmt =>
  "SelectStmt" in node
export const isStar = (node: QueryParser.QueryNode<any>): node is QueryParser.PgStar =>
  "A_Star" in node

export function getNodeType<NodeType extends string>(
  node: QueryParser.QueryNode<NodeType>
): NodeType {
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
