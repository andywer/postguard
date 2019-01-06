import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import { TableSchemaDescriptor } from "squid"
import * as ts from "typescript"

export interface SourceFile {
  fileContent: string
  filePath: string
  ts?: {
    program: ts.Program
    sourceFile: ts.SourceFile
  }
}

export interface TableSchema {
  sourceFile: SourceFile
  tableName: string
  columnNames: string[]
  columnDescriptors: TableSchemaDescriptor
  loc: types.SourceLocation | null
}

export interface TableReference {
  tableName: string
  as?: string
  path: QueryNodePath<any>
}

export interface AllOfColumnReference {
  tableName: string
  columnName: "*"
  path: QueryNodePath<any>
}

// FIXME: The `any?` marker is too unspecific. It's either a columnName or `any` is set.

export interface QualifiedColumnReference {
  tableName: string
  columnName: string
  path: QueryNodePath<any>
  any?: true
}

export interface UnqualifiedColumnReference {
  tableRefsInScope: TableReference[]
  columnName: string
  path: QueryNodePath<any>
  any?: true
}

export type ColumnReference =
  | QualifiedColumnReference
  | UnqualifiedColumnReference
  | AllOfColumnReference

export interface QuerySourceMapSpan {
  isTemplateExpression?: boolean
  sourceLocation: types.SourceLocation
  queryStartIndex: number
  queryEndIndex: number
}

export interface QueryNodePath<Node extends any> {
  ancestors: Array<QueryNodePath<any>>
  node: Node
  parentPropKey: string
  type: string
}

export interface Query {
  type: string
  query: string
  path: QueryNodePath<any>
  exposedAsTable?: string
  referencedColumns: ColumnReference[]
  referencedTables: TableReference[]
  returnedColumns: ColumnReference[]
  returnsIntoParentQuery?: boolean
  sourceFile: SourceFile
  sourceMap: QuerySourceMapSpan[]
  subqueries: Query[]
}

export interface QueryInvocation {
  query: Query
  resultTypeAssertion?: {
    path: NodePath<types.Node>
    schema: TableSchemaDescriptor
  }
}
