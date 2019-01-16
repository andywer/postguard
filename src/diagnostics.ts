import { codeFrameColumns, SourceLocation } from "@babel/code-frame"
import * as logSymbols from "log-symbols"
import * as format from "./format"
import { Query, QueryNodePath, SourceFile } from "./types"

export { SourceLocation }

export enum DiagnosticType {
  error = "error",
  warning = "warning"
}

export interface Diagnostic {
  message: string
  queryPath?: QueryNodePath<any>
  sourceFile: SourceFile
  sourceLocation: SourceLocation | null
  type: DiagnosticType
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

export function createSourceFileDiagnostic(
  type: DiagnosticType,
  message: string,
  sourceFile: SourceFile,
  location: SourceLocation | null
): Diagnostic {
  return {
    message,
    sourceFile,
    sourceLocation: location,
    type
  }
}

export function createQueryDiagnostic(
  type: DiagnosticType,
  message: string,
  query: Query,
  offsetInQuery: number
): Diagnostic {
  return {
    message,
    sourceFile: query.sourceFile,
    sourceLocation: mapToSourceLocation(query, offsetInQuery),
    type
  }
}

export function createQueryNodeDiagnostic(
  type: DiagnosticType,
  message: string,
  path: QueryNodePath<any>,
  query: Query
): Diagnostic {
  const sourceLocation =
    path.type in path.node && "location" in path.node[path.type]
      ? mapToSourceLocation(query, path.node[path.type].location)
      : getOverallSourceLocation(query.sourceMap.map(span => span.sourceLocation))

  return {
    message,
    queryPath: path,
    sourceFile: query.sourceFile,
    sourceLocation,
    type
  }
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

function formatDiagnostic(diagnostic: Diagnostic) {
  const formattedQuery = diagnostic.sourceLocation
    ? codeFrameColumns(diagnostic.sourceFile.fileContent, diagnostic.sourceLocation)
    : ""
  const sourceLink = formatSourceLink(diagnostic.sourceFile.filePath, diagnostic.sourceLocation)

  const formatter = diagnostic.type === DiagnosticType.warning ? format.warning : format.error
  const prefix = diagnostic.type === DiagnosticType.warning ? "Warning: " : "Error: "

  const indentedMessage = diagnostic.message
    .split("\n")
    .map(line => `  ${line}`)
    .join("\n")

  return (
    formatter(`${prefix}Query validation failed in ${sourceLink}:`) +
    `\n\n` +
    formatter(indentedMessage) +
    `\n\n` +
    formattedQuery
  ).trim()
}

export function printDiagnostic(diagnostic: Diagnostic) {
  const formattedMessage = formatDiagnostic(diagnostic)

  if (diagnostic.type === DiagnosticType.warning) {
    console.warn(`${logSymbols.warning} ${formattedMessage}`)
  } else {
    console.error(`${logSymbols.error} ${formattedMessage}`)
  }
}

export function throwDiagnostics(callback: () => void): any {
  const diagnostics = collectDiagnostics(callback)
  const errors = diagnostics.filter(diagnostic => diagnostic.type === DiagnosticType.error)

  if (errors.length > 0) {
    throw Object.assign(new Error(formatDiagnostic(errors[0])), { name: "ValidationError" })
  }
}

let collectingDiagnosticsRightNow = false
let reportedDiagnostics: Diagnostic[] = []

export function reportDiagnostic(diagnostic: Diagnostic) {
  reportedDiagnostics.push(diagnostic)
}

export function collectDiagnostics(callback: () => any): Diagnostic[] {
  if (collectingDiagnosticsRightNow) {
    throw new Error(
      "Already collecting diagnostics. Redundant diagnostics collection is not allowed."
    )
  }

  reportedDiagnostics = []
  collectingDiagnosticsRightNow = true

  try {
    callback()
    return reportedDiagnostics
  } finally {
    collectingDiagnosticsRightNow = false
    reportedDiagnostics = []
  }
}

process.on("exit", () => {
  if (reportedDiagnostics.length > 0) {
    const formattedDiagnostics = reportedDiagnostics.map(formatDiagnostic).join("\n\n")
    throw new Error(
      `Diagnostics have been reported, but have never been handled:\n\n${formattedDiagnostics}`
    )
  }
})
