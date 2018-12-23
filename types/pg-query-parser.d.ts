declare module "pg-query-parser" {
  export type QueryNodeType = string

  export interface QueryNode<NodeType extends QueryNodeType> {
    [key: string]: any
  }

  interface PgInteger {
    Integer: {
      ival: number
    }
  }

  interface PgString {
    String: {
      str: string
    }
  }

  interface PgConst {
    A_Const: {
      val: PgString | PgInteger
      location: number
    }
  }

  interface Alias {
    Alias: {
      aliasname: string
      location: number
    }
  }

  interface ColumnRef {
    ColumnRef: {
      fields: Array<PgString | PgStar>
      location: number
    }
  }

  interface ParamRef {
    ParamRef: {
      number: number
      location: number
    }
  }

  interface PgStar {
    A_Star: {}
  }

  interface RelationRef {
    RangeVar: {
      relname: string
      inhOpt: number
      relpersistence: string
      alias?: Alias
      location: number
    }
  }

  interface ResTarget {
    ResTarget: {
      name?: string
      val: ColumnRef | ParamRef | PgExpression
      location: number
    }
  }

  interface BoolExpr {
    BoolExpr: {
      boolop: number
      args: PgExpression[]
      location: number
    }
  }

  interface Expr {
    A_Expr: {
      kind: number
      name: PgString[]
      lexpr: ColumnRef | ParamRef | PgConst
      rexpr: ColumnRef | ParamRef | PgConst
      location: number
    }
  }

  interface SubLink {
    SubLink: {
      subLinkType: number
      subselect?: SelectStmt
      location: number
    }
  }

  interface TypeCast {
    TypeCast: {
      arg: PgExpression
      typeName: TypeName
      location: number
    }
  }

  interface TypeName {
    TypeName: {
      names: PgString[]
      typemod: number
      location: number
    }
  }

  interface CommonTableExpr {
    CommonTableExpr: {
      ctename: string
      ctequery: Query
      location: number
    }
  }

  interface WithClause {
    WithClause: {
      ctes: CommonTableExpr[]
    }
  }

  type PgExpression = BoolExpr | Expr | PgConst | SubLink | TypeCast

  interface JoinExpr {
    JoinExpr: {
      jointype: number
      larg: RelationRef
      rarg: RelationRef
      quals: Expr
    }
  }

  interface SortClause {
    SortBy: {
      node: ColumnRef
      sortby_dir: number
      sortby_nulls: number
      location: number
    }
  }

  interface DeleteStmt {
    DeleteStmt: {
      relation: RelationRef
      whereClause?: PgExpression
    }
  }

  interface InsertStmt {
    InsertStmt: {
      relation: RelationRef
      cols: ResTarget[]
      selectStmt: SelectStmt
      returningList?: ResTarget[]
      withClause?: WithClause
    }
  }

  interface SelectStmt {
    SelectStmt: {
      targetList?: ResTarget[]
      fromClause?: Array<JoinExpr | RelationRef>
      // TODO: intoClause
      limitCount?: PgExpression
      limitOffset?: PgExpression
      groupClause?: ColumnRef | ColumnRef[]
      havingClause?: PgExpression
      sortClause?: SortClause
      whereClause?: PgExpression
      valuesLists?: PgExpression[]
      larg?: Query
      rarg?: Query
      op: number
    }
  }

  interface UpdateStmt {
    UpdateStmt: {
      relation: RelationRef
      targetList: ResTarget[]
      whereClause?: PgExpression
    }
  }

  export type Query = DeleteStmt | InsertStmt | SelectStmt | UpdateStmt

  export interface ParsingError {
    fileName: string
    lineNumber: number
    cursorPosition: number
    functionName: string
  }

  interface ParsingResult {
    error?: ParsingError
    query: Query[]
    stderr?: string
  }

  export function parse(query: string): ParsingResult
}
