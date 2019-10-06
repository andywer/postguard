import {
  ColumnReference,
  QualifiedColumnReference,
  Query,
  TableSchema,
  UnqualifiedColumnReference
} from "./types"

function flatMap<In, Out>(elements: In[], mapper: (element: In) => Out[]): Out[] {
  return elements.reduce((flattened, element) => [...flattened, ...mapper(element)], [] as Out[])
}

function getTableByName(tables: TableSchema[], tableName: string): TableSchema {
  const table = tables.find(schema => schema.tableName === tableName)

  if (!table) {
    const tableNames = tables.map(schema => `"${schema.tableName}"`)
    throw new Error(
      `No table named "${tableName}" found. Known tables in scope: ${tableNames.join(", ")}`
    )
  }

  return table
}

export function resolveUnqualifiedColumnRef(
  columnRef: UnqualifiedColumnReference,
  tables: TableSchema[]
): QualifiedColumnReference {
  if (columnRef.any) {
    if (columnRef.tableRefsInScope.length === 1) {
      const tableName = getTableByName(tables, columnRef.tableRefsInScope[0].tableName).tableName
      return {
        ...columnRef,
        tableName
      }
    } else {
      throw new Error(
        `Cannot resolve column reference originating from non-inferrable spread expression.`
      )
    }
  }

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
  } else if (inScopeSchemasContainingColumn.length > 1) {
    throw new Error(
      `Unqualified column reference "${columnRef.columnName}" matches more than one referenced table: ` +
        inScopeSchemasContainingColumn.map(schema => schema.tableName).join(", ")
    )
  }

  return {
    ...columnRef,
    tableName: inScopeSchemasContainingColumn[0].tableName
  }
}

function resolveTable(columnRef: ColumnReference, tables: TableSchema[]): TableSchema {
  if ("tableName" in columnRef) {
    return getTableByName(tables, columnRef.tableName)
  } else {
    if (columnRef.tableRefsInScope.length === 0) {
      throw new Error(`Cannot resolve unqualified "*" column selector: No known tables.`)
    }
    if (columnRef.tableRefsInScope.length > 1) {
      const tablesInScopeNames = columnRef.tableRefsInScope.map(
        tableRef => `"${tableRef.tableName}"`
      )
      throw new Error(
        `Cannot resolve unqualified "*" column selector. More than one table in scope: ${tablesInScopeNames.join(
          ", "
        )}`
      )
    }

    const tableName = columnRef.tableRefsInScope[0].tableName
    return getTableByName(tables, tableName)
  }
}

function resolveStarColumnRef(
  columnRef: ColumnReference,
  tables: TableSchema[]
): QualifiedColumnReference[] {
  const table = resolveTable(columnRef, tables)

  return table.columnNames.map(columnName => ({
    tableName: table.tableName,
    columnName,
    path: columnRef.path
  }))
}

export function resolveToConcreteColumnRefs(
  columnRefs: ColumnReference[],
  tables: TableSchema[]
): ColumnReference[] {
  return flatMap(columnRefs, columnRef => {
    if (columnRef.columnName !== "*") return [columnRef]
    return resolveStarColumnRef(columnRef, tables)
  })
}

export function resolveColumnReferences(query: Query, tables: TableSchema[]): ColumnReference[] {
  const columnsReturnedBySubqueries = flatMap(query.subqueries, subquery => {
    if (!subquery.returnsIntoParentQuery) return []

    const columnRefs = resolveToConcreteColumnRefs(subquery.returnedColumns, tables)
    return columnRefs.map(columnRef => {
      return "tableName" in columnRef ? columnRef : resolveUnqualifiedColumnRef(columnRef, tables)
    })
  })

  return [
    ...query.referencedColumns.filter(columnRef => columnRef.columnName !== "*"),
    ...columnsReturnedBySubqueries
  ]
}
