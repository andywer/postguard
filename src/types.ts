import * as types from "@babel/types"
import * as ts from "typescript"
import { QueryNodePath } from "./query-parser-utils"

export interface SourceFile {
  filePath: string,
  ts?: {
    program: ts.Program,
    sourceFile: ts.SourceFile
  }
}

export interface TableSchema {
  sourceFile: SourceFile,
  tableName: string,
  columnNames: string[],
  loc: types.SourceLocation | null
}

export interface TableReference {
  tableName: string,
  as?: string,
  path: QueryNodePath<any>
}

export interface QualifiedColumnReference {
  tableName: string,
  columnName: string,
  path: QueryNodePath<any>
}

export interface UnqualifiedColumnReference {
  tableRefsInScope: TableReference[],
  columnName: string,
  path: QueryNodePath<any>
}

export type ColumnReference = QualifiedColumnReference | UnqualifiedColumnReference

export interface Query {
  sourceFile: SourceFile,
  query: string,
  referencedColumns: ColumnReference[],
  referencedTables: TableReference[],
  loc: types.SourceLocation | null
}
