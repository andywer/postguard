import { augmentFileValidationError, augmentValidationError } from "./errors"
import {
  QualifiedColumnReference,
  Query,
  TableReference,
  TableSchema,
  UnqualifiedColumnReference
} from "./types"

function assertIntactQualifiedColumnRef(
  columnRef: QualifiedColumnReference,
  tables: TableSchema[]
) {
  const table = tables.find(someTable => someTable.tableName === columnRef.tableName)

  if (!table) {
    throw new Error(`No table named ${columnRef.tableName} has been defined.`)
  }

  if (table.columnNames.indexOf(columnRef.columnName) > -1) {
    throw new Error(
      `Table ${columnRef.tableName} does not have a column named ${columnRef.columnName}.`
    )
  }
}

function assertIntactUnqualifiedColumnRef(
  columnRef: UnqualifiedColumnReference,
  tables: TableSchema[]
) {
  let tablesInScopeSchemas: TableSchema[] = []

  for (const availableTableRef of columnRef.tableRefsInScope) {
    tablesInScopeSchemas = [
      ...tablesInScopeSchemas,
      ...tables.filter(
        schema =>
          schema.tableName === availableTableRef.tableName &&
          !tablesInScopeSchemas.find(
            presentSchema => presentSchema.tableName === availableTableRef.tableName
          )
      )
    ]
  }

  const inScopeSchemasContainingColumn = tablesInScopeSchemas.filter(
    schema => schema.columnNames.indexOf(columnRef.columnName) > -1
  )

  if (inScopeSchemasContainingColumn.length === 0) {
    const tablesInScopeNames = tablesInScopeSchemas.map(schema => `"${schema.tableName}"`)
    throw new Error(
      `No table in the query's scope has a column "${columnRef.columnName}".\n` +
        `Tables in scope: ${
          tablesInScopeNames.length > 0 ? tablesInScopeNames.join(", ") : "(none)"
        }` +
        inScopeSchemasContainingColumn.map(schema => schema.tableName).join(", ")
    )
  }
  if (inScopeSchemasContainingColumn.length > 1) {
    throw new Error(
      `Unqualified column reference "${
        columnRef.columnName
      }" matches more than one referenced table: ` +
        inScopeSchemasContainingColumn.map(schema => schema.tableName).join(", ")
    )
  }
}

function assertIntactTableRef(tableRef: TableReference, tables: TableSchema[]) {
  if (!tables.find(schema => schema.tableName === tableRef.tableName)) {
    throw new Error(`No table with name "${tableRef.tableName}" has been defined.`)
  }
}

export function assertNoBrokenColumnRefs(query: Query, tables: TableSchema[]) {
  try {
    for (const columnRef of query.referencedColumns) {
      try {
        if ("tableName" in columnRef) {
          assertIntactQualifiedColumnRef(columnRef, tables)
        } else {
          assertIntactUnqualifiedColumnRef(columnRef, tables)
        }
      } catch (error) {
        throw augmentValidationError(error, columnRef.path, query)
      }
    }
  } catch (error) {
    throw augmentFileValidationError(error, query)
  }
}

export function assertNoBrokenTableRefs(query: Query, tables: TableSchema[]) {
  try {
    for (const tableRef of query.referencedTables) {
      try {
        assertIntactTableRef(tableRef, tables)
      } catch (error) {
        throw augmentValidationError(error, tableRef.path, query)
      }
    }
  } catch (error) {
    throw augmentFileValidationError(error, query)
  }
}
