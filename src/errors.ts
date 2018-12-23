import { codeFrameColumns, SourceLocation } from "@babel/code-frame"
import { ParsingError } from "pg-query-parser"
import * as format from "./format"
import { Query } from "./parse-file"
import { QueryNodePath } from "./query-parser-utils"
import { SourceFile } from "./types"

export interface SyntaxError extends Error {
  location: SourceLocation,
  sourceFile: SourceFile
}

export interface ValidationError extends Error {
  location: SourceLocation,
  path: QueryNodePath<any>,
  sourceFile: SourceFile
}

export function fail (message: string): never {
  throw new Error(message)
}

function formatSourceLink (filePath: string, location?: SourceLocation | null): string {
  if (location) {
    const locationString = location.start.column
      ? `${filePath}:${location.start.line}:${location.start.column + 1}`
      : `${filePath}:${location.start.line}`
    return format.sourceReference(locationString)
  } else {
    return format.sourceReference(filePath)
  }
}

function getOverallSourceLocation (locations: SourceLocation[]): SourceLocation {
  const first = locations[0]
  const last = locations[locations.length - 1]
  return {
    start: {
      column: first.start.column,
      line: first.start.line
    },
    end: {
      column: last.start.column,
      line: last.start.line
    }
  }
}

function mapToSourceLocation (query: Query, stringIndex: number): SourceLocation {
  const matchingSpan = query.sourceMap.find(span => span.queryStartIndex <= stringIndex && span.queryEndIndex > stringIndex)
  if (!matchingSpan) return getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))

  const indexInSpan = stringIndex - matchingSpan.queryStartIndex
  const preceedingTextInSpan = query.query.substring(matchingSpan.queryStartIndex, stringIndex)

  const lineIndexInSpan = preceedingTextInSpan.replace(/[^\n]/g, "").length
  const columnIndexInSpan = indexInSpan - preceedingTextInSpan.lastIndexOf("\n")

  return {
    start: {
      column: lineIndexInSpan > 0 ? columnIndexInSpan : matchingSpan.sourceLocation.start.column + columnIndexInSpan,
      line: matchingSpan.sourceLocation.start.line + lineIndexInSpan
    }
  }
}

export function isAugmentedError (error: Error | SyntaxError | ValidationError) {
  return error.name === "QuerySyntaxError" || error.name === "ValidationError"
}

export function augmentFileValidationError (error: Error | SyntaxError | ValidationError, query: Query) {
  const location = "location" in error && error.location
    ? error.location
    : getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))

  const formattedQuery = codeFrameColumns(query.sourceFile.fileContent, location)

  error.name = "ValidationError"
  error.message = (
    format.error(`Query validation failed in ${formatSourceLink(query.sourceFile.filePath, location)}:`) + `\n\n` +
    format.error(`${error.message}`) + `\n\n` +
    formattedQuery
  )
  return error
}

export function augmentQuerySyntaxError (error: Error, syntaxError: ParsingError, query: Query): SyntaxError {
  return Object.assign(error as SyntaxError, {
    name: "QuerySyntaxError",
    location: mapToSourceLocation(query, syntaxError.cursorPosition - 1),
    sourceFile: query.sourceFile
  })
}

export function augmentValidationError (error: Error, path: QueryNodePath<any>, query: Query): ValidationError {
  const location = path.type in path.node && "location" in path.node[path.type]
    ? mapToSourceLocation(query, path.node[path.type].location)
    : undefined

  return Object.assign(error as ValidationError, {
    name: "ValidationError",
    path,
    location,
    sourceFile: query.sourceFile
  })
}
