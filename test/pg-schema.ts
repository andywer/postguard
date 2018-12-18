export enum ColumnType {
  Array = 'array',
  Boolean = 'boolean',
  Date = 'date',
  Enum = 'enum',
  JSON = 'json',
  Number = 'number',
  String = 'string'
}

interface ColumnDescription<Type extends ColumnType, EnumValues extends string | number, SubType extends ColumnDescription<any, any, any>> {
  type: Type
  subtype?: SubType
  enum?: EnumValues[]
  nullable?: boolean
}

export type TableSchemaDescription = {
  [columnName: string]: {
    type: ColumnType
    enum?: Array<string | number>
    nullable?: boolean
  }
}

interface TableSchema<Columns extends TableSchemaDescription> {
  name: string,
  columns: Columns
}

type DeriveBuiltinTypeByColumnType<Column extends ColumnDescription<any, any, any>> = Column extends { type: infer ColumnType }
  ? (
    ColumnType extends ColumnType.Boolean ? boolean :
    ColumnType extends ColumnType.Date ? string :
    ColumnType extends ColumnType.JSON ? any :
    ColumnType extends ColumnType.Number ? number :
    ColumnType extends ColumnType.String ? string :
    ColumnType extends ColumnType.Enum ? (
      Column extends ColumnDescription<ColumnType.Enum, infer EnumValues, any> ? EnumValues : never
    ) : any
  ) : never

type DeriveBuiltinType<Column extends ColumnDescription<any, any, any>> =
  Column extends { nullable: true }
  ? DeriveBuiltinTypeByColumnType<Exclude<Column, 'nullable'>> | null
  : (
    Column extends ColumnDescription<ColumnType.Array, any, infer SubType>
    ? Array<DeriveBuiltinTypeByColumnType<SubType>>
    : DeriveBuiltinTypeByColumnType<Column>
  )

export type TableRow<ConcreteTableSchema extends TableSchema<any>> = ConcreteTableSchema extends TableSchema<infer Columns>
  ? {
    [columnName in keyof Columns]: DeriveBuiltinType<Columns[columnName]>
  }
  : never

interface SchemaTypes {
  Boolean: { type: ColumnType.Boolean }
  Date: { type: ColumnType.Date }
  JSON: { type: ColumnType.JSON }
  Number: { type: ColumnType.Number }
  String: { type: ColumnType.String }
  array<SubType extends ColumnDescription<any, any, any>> (subtype: SubType): ColumnDescription<ColumnType.Array, any, SubType>
  enum<T extends string | number> (values: T[]): ColumnDescription<ColumnType.Enum, T, any>
  nullable<Column extends ColumnDescription<any, any, any>> (column: Column): Column & { nullable: true }
}

export const Schema: SchemaTypes = {
  Boolean: { type: ColumnType.Boolean },
  Date: { type: ColumnType.Date },
  JSON: { type: ColumnType.JSON },
  Number: { type: ColumnType.Number },
  String: { type: ColumnType.String },

  array<SubType extends ColumnDescription<any, any, any>> (subtype: SubType) {
    return { type: ColumnType.Array, subtype }
  },
  enum<T extends string | number> (values: T[]) {
    return { type: ColumnType.Enum, enum: values }
  },
  nullable<Column extends ColumnDescription<any, any, any>> (column: Column) {
    return { ...(column as any), nullable: true }
  }
}

const allTableSchemas: TableSchema<any>[] = []

export function defineTable<Columns extends TableSchemaDescription> (
  tableName: string,
  schema: Columns
): TableSchema<Columns> {
  const table: TableSchema<Columns> = {
    name: tableName,
    columns: schema
  }
  allTableSchemas.push(table)
  return table
}

export function getAllTableSchemas() {
  return allTableSchemas
}
