import { codeFrameColumns, SourceLocation } from "@babel/code-frame"
import { ParsingError } from "pg-query-parser"
import { Query } from "./parse-file"
import { QueryNodePath } from "./query-parser-utils"

export interface SyntaxError extends Error {
  location: number
}

export interface ValidationError extends Error {
  location?: number
  path: QueryNodePath<any>
}

export function fail (message: string): never {
  throw new Error(message)
}

function formatSourceLink (filePath: string, location?: SourceLocation | null): string {
  if (location) {
    return `${filePath}:${location.start.line}`
      + (location.start.column ? `:${location.start.column + 1}` : ``)
  } else {
    return filePath
  }
}

function translateIndexToSourceLocation (text: string, index: number): SourceLocation["start"] {
  const linesUntilIndex = text.substring(0, index).split("\n")
  const line = linesUntilIndex.length
  const column = linesUntilIndex[linesUntilIndex.length - 1].length
  return {
    line,
    column
  }
}

export function isAugmentedError (error: Error | SyntaxError | ValidationError) {
  return error.name === "QuerySyntaxError" || error.name === "ValidationError"
}

export function augmentFileValidationError (error: Error | SyntaxError | ValidationError, query: Query) {
  const formattedQuery = "location" in error && error.location && error.location > 0
    ? codeFrameColumns(query.query, { start: translateIndexToSourceLocation(query.query, error.location) })
    : query

  error.name = "ValidationError"
  error.message = (
    `Query validation failed in ${formatSourceLink(query.filePath, query.loc)}:\n\n` +
    `${error.message}\n\n` +
    formattedQuery
  )
  return error
}

export function augmentQuerySyntaxError (error: Error, syntaxError: ParsingError): SyntaxError {
  return Object.assign(error as SyntaxError, {
    name: "QuerySyntaxError",
    location: syntaxError.cursorPosition
  })
}

export function augmentValidationError (error: Error, path: QueryNodePath<any>): ValidationError {
  return Object.assign(error as ValidationError, {
    location: path.type in path.node && "location" in path.node[path.type] ? path.node[path.type].location + 1 : undefined,
    name: "ValidationError",
    path
  })
}
