import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import { Schema, TableSchemaDescriptor } from "squid"
import {
  createQueryNodeDiagnostic,
  createSourceFileDiagnostic,
  reportDiagnostic,
  DiagnosticType
} from "./diagnostics"
import { resolveColumnReferences, resolveUnqualifiedColumnRef } from "./resolver"
import { getAllSubqueries } from "./utils"
import {
  AllOfColumnReference,
  ColumnReference,
  QualifiedColumnReference,
  Query,
  QueryInvocation,
  TableReference,
  TableSchema,
  UnqualifiedColumnReference
} from "./types"

const isAllOfColumnReference = (ref: ColumnReference): ref is AllOfColumnReference =>
  (ref as AllOfColumnReference).columnName === "*" || false
const isUnresolvableColumnReference = (ref: ColumnReference) =>
  (ref as UnqualifiedColumnReference).any || false

function assertIntactQualifiedColumnRef(
  columnRef: QualifiedColumnReference,
  tables: TableSchema[]
) {
  // Cannot validate column references that originate from non-inferrable spread expression
  if (isUnresolvableColumnReference(columnRef)) return

  const table = tables.find(someTable => someTable.tableName === columnRef.tableName)

  if (!table) {
    throw new Error(`No table named ${columnRef.tableName} has been defined.`)
  }

  if (table.columnNames.indexOf(columnRef.columnName) === -1) {
    throw new Error(
      `Table "${columnRef.tableName}" does not have a column named "${columnRef.columnName}".`
    )
  }
}

function assertIntactTableRef(tableRef: TableReference, tables: TableSchema[]) {
  const tableSchema = tables.find(schema => schema.tableName === tableRef.tableName)
  if (!tableSchema) {
    throw new Error(`No table with name "${tableRef.tableName}" has been defined.`)
  }
  return tableSchema
}

function checkForBrokenColumnRefs(query: Query, tables: TableSchema[]) {
  const referencedColumns = resolveColumnReferences(query, tables)

  for (const columnRef of referencedColumns) {
    try {
      const qualifiedColumnRef =
        "tableName" in columnRef ? columnRef : resolveUnqualifiedColumnRef(columnRef, tables)

      assertIntactQualifiedColumnRef(qualifiedColumnRef, tables)
    } catch (error) {
      reportDiagnostic(
        createQueryNodeDiagnostic(DiagnosticType.error, error.message, columnRef.path, query)
      )
    }
  }
}

function checkForBrokenTableRefs(query: Query, tables: TableSchema[]) {
  for (const tableRef of query.referencedTables) {
    try {
      assertIntactTableRef(tableRef, tables)
    } catch (error) {
      reportDiagnostic(
        createQueryNodeDiagnostic(DiagnosticType.error, error.message, tableRef.path, query)
      )
    }
  }
}

function checkForIncompleteInsertValues(query: Query, tables: TableSchema[]) {
  // FIXME: Consider SELECT INTO queries as well
  if (query.type !== "INSERT") return
  if (query.referencedColumns.some(isUnresolvableColumnReference)) return

  const schema = assertIntactTableRef(query.referencedTables[0], tables)

  const mandatoryColumns = schema.columnNames
    .map(columnName => ({ ...schema.columnDescriptors[columnName], columnName }))
    .filter(descriptor => !descriptor.hasDefault)

  const queryColumns = [...query.referencedColumns, ...resolveColumnReferences(query, tables)]

  for (const mandatoryColumn of mandatoryColumns) {
    const columnReference = queryColumns.find(
      columnRef => columnRef.columnName === mandatoryColumn.columnName
    )

    if (!columnReference) {
      const message = `Column "${mandatoryColumn.columnName}" is missing from INSERT statement.`
      reportDiagnostic(createQueryNodeDiagnostic(DiagnosticType.error, message, query.path, query))
    }
  }
}

function resolveColumnRefsToTableSchemaDescriptor(
  returnedColumns: ColumnReference[],
  tables: TableSchema[]
): TableSchemaDescriptor {
  let syntheticSchema: TableSchemaDescriptor = {}

  for (const columnRef of returnedColumns) {
    if (isAllOfColumnReference(columnRef)) {
      const referencedTableSchema = assertIntactTableRef(columnRef, tables)

      syntheticSchema = {
        ...syntheticSchema,
        ...referencedTableSchema.columnDescriptors
      }
    } else {
      syntheticSchema[columnRef.columnName] = Schema.Any
    }
  }

  return syntheticSchema
}

function checkIfQueryMatchesReturnType(
  resultSchema: TableSchemaDescriptor,
  expectedResult: TableSchemaDescriptor,
  path: NodePath<types.Node>,
  query: Query
) {
  const expectedColumnNames = Object.keys(expectedResult)
  const actualColumnNames = Object.keys(resultSchema)

  const missingColumnNames = expectedColumnNames.filter(
    expectedColumnName => actualColumnNames.indexOf(expectedColumnName) === -1
  )

  if (missingColumnNames.length > 0) {
    const error = new Error(
      `Query's result does not match the expected result type.\n` +
        `  Missing columns in result rows: ${missingColumnNames
          .map(columnName => `"${columnName}"`)
          .join(", ")}\n` +
        `  Actual columns in result rows: ${actualColumnNames
          .map(columnName => `"${columnName}"`)
          .join(", ")}`
    )
    reportDiagnostic(
      createSourceFileDiagnostic(
        DiagnosticType.error,
        error.message,
        query.sourceFile,
        path.node.loc
      )
    )
  }

  // TODO: Validate result column types
}

function resolveSubqueryToTableSchema(
  query: Query & { exposedAsTable: string },
  tables: TableSchema[]
): TableSchema {
  const schema = resolveColumnRefsToTableSchemaDescriptor(query.returnedColumns, tables)
  return {
    tableName: query.exposedAsTable,
    columnDescriptors: schema,
    columnNames: Object.keys(schema),
    loc: query.path.node.loc,
    sourceFile: query.sourceFile
  }
}

export function checkSchemasForDuplicates(allTableSchemas: TableSchema[]) {
  for (const schema of allTableSchemas) {
    const schemasMatchingThatName = allTableSchemas.filter(
      someSchema => someSchema.tableName === schema.tableName
    )
    if (schemasMatchingThatName.length > 1) {
      const message =
        `Table "${schema.tableName}" has been defined more than once:\n` +
        schemasMatchingThatName
          .map(duplicate => {
            const lineRef = duplicate.loc ? `:${duplicate.loc.start.line}` : ``
            return `  - ${duplicate.sourceFile.filePath}${lineRef}`
          })
          .join("\n")
      reportDiagnostic(
        createSourceFileDiagnostic(DiagnosticType.error, message, schema.sourceFile, schema.loc)
      )
    }
  }
}

function validateSubquery(query: Query, tables: TableSchema[]) {
  checkForBrokenTableRefs(query, tables)
  checkForBrokenColumnRefs(query, tables)
  checkForIncompleteInsertValues(query, tables)

  for (const subquery of query.subqueries) {
    validateSubquery(subquery, tables)
  }
}

function validateQueryInvocation(invocation: QueryInvocation, tables: TableSchema[]) {
  const { query, resultTypeAssertion } = invocation

  if (!resultTypeAssertion || query.returnedColumns.some(isUnresolvableColumnReference)) {
    return
  }

  const resultSchema = resolveColumnRefsToTableSchemaDescriptor(query.returnedColumns, tables)

  checkIfQueryMatchesReturnType(
    resultSchema,
    resultTypeAssertion.schema,
    resultTypeAssertion.path,
    query
  )
}

export function validateQuery(invocation: QueryInvocation, tables: TableSchema[]) {
  const tableExpressions: TableSchema[] = getAllSubqueries(invocation.query)
    .map<TableSchema | null>(subquery =>
      subquery.exposedAsTable
        ? resolveSubqueryToTableSchema(subquery as Query & { exposedAsTable: string }, tables)
        : null
    )
    .filter((schemaOrNull): schemaOrNull is TableSchema => schemaOrNull !== null)

  validateSubquery(invocation.query, [...tables, ...tableExpressions])
  validateQueryInvocation(invocation, [...tables, ...tableExpressions])
}
