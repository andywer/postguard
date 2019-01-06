import { codeFrameColumns, SourceLocation } from "@babel/code-frame"
import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import { ParsingError } from "pg-query-parser"
import * as format from "./format"
import { Query, QueryNodePath, SourceFile } from "./types"

interface CodeError extends Error {
  location: SourceLocation
  sourceFile: SourceFile
}

interface ValidationError extends Error {
  location: SourceLocation
  path: QueryNodePath<any>
  sourceFile: SourceFile
}

export function fail(message: string): never {
  throw new Error(message)
}

function formatSourceLink(filePath: string, location?: SourceLocation | null): string {
  if (location) {
    const locationString = location.start.column
      ? `${filePath}:${location.start.line}:${location.start.column + 1}`
      : `${filePath}:${location.start.line}`
    return format.sourceReference(locationString)
  } else {
    return format.sourceReference(filePath)
  }
}

function getLineColumnOffset(text: string, startIndex: number) {
  const preceedingText = text.substring(0, startIndex)

  const lineOffset = preceedingText.replace(/[^\n]/g, "").length
  const columnOffset = startIndex - preceedingText.lastIndexOf("\n")

  return {
    columnOffset,
    lineOffset
  }
}

function getOverallSourceLocation(locations: SourceLocation[]): SourceLocation {
  const first = locations[0]
  const last = locations[locations.length - 1]
  return {
    start: {
      column: first.start.column,
      line: first.start.line
    },
    end: {
      column: last.end ? last.end.column : last.start.column,
      line: last.end ? last.end.line : last.start.line
    }
  }
}

function mapToSourceLocation(query: Query, stringIndex: number): SourceLocation {
  const matchingSpan = query.sourceMap.find(
    span => span.queryStartIndex <= stringIndex && span.queryEndIndex > stringIndex
  )
  if (!matchingSpan) {
    return getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))
  }

  const indexInSpan = stringIndex - matchingSpan.queryStartIndex
  const textInSpan = query.query.substring(matchingSpan.queryStartIndex, matchingSpan.queryEndIndex)

  const offsetsInSpan = getLineColumnOffset(textInSpan, indexInSpan)
  const columnOffsetInSpan = matchingSpan.isTemplateExpression ? 1 : offsetsInSpan.columnOffset

  return {
    start: {
      column:
        offsetsInSpan.lineOffset > 0
          ? columnOffsetInSpan
          : matchingSpan.sourceLocation.start.column + columnOffsetInSpan,
      line: matchingSpan.sourceLocation.start.line + offsetsInSpan.lineOffset
    }
  }
}

export function isAugmentedError(error: Error | CodeError | ValidationError) {
  return error.name === "QuerySyntaxError" || error.name === "ValidationError"
}

export function augmentFileValidationError(
  error: Error | CodeError | ValidationError,
  query: Query
) {
  const location =
    "location" in error && error.location
      ? error.location
      : getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))

  const formattedQuery = codeFrameColumns(query.sourceFile.fileContent, location)

  error.name = "ValidationError"
  error.message =
    format.error(
      `Query validation failed in ${formatSourceLink(query.sourceFile.filePath, location)}:`
    ) +
    `\n\n` +
    format.error(`${error.message}`) +
    `\n\n` +
    formattedQuery
  return error
}

export function augmentQuerySyntaxError(
  error: Error,
  syntaxError: ParsingError,
  query: Query
): CodeError {
  // tslint:disable-next-line prefer-object-spread
  return Object.assign(error, {
    name: "QuerySyntaxError",
    location: mapToSourceLocation(query, syntaxError.cursorPosition - 1),
    sourceFile: query.sourceFile
  })
}

export function augmentValidationError(
  error: Error,
  path: QueryNodePath<any>,
  query: Query
): ValidationError {
  const location =
    path.type in path.node && "location" in path.node[path.type]
      ? mapToSourceLocation(query, path.node[path.type].location)
      : getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))

  // tslint:disable-next-line prefer-object-spread
  return Object.assign(error, {
    name: "ValidationError",
    path,
    location,
    sourceFile: query.sourceFile
  })
}

export function augmentCodeError(
  error: Error,
  path: NodePath<types.Node>,
  query: Query
): CodeError {
  // tslint:disable-next-line prefer-object-spread
  return Object.assign(error, {
    name: "ValidationError",
    location: path.node.loc as SourceLocation,
    sourceFile: query.sourceFile
  })
}
