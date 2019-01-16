import { parse, traverse } from "@babel/core"
import * as fs from "fs"
import { createSourceFileDiagnostic, reportDiagnostic, DiagnosticType } from "../diagnostics"
import { QueryInvocation, SourceFile, TableSchema } from "../types"
import { compileFiles } from "../typescript/file"
import { parseQuery } from "./parse-query"
import { getReferencedNamedImport } from "./babel-imports"
import { createQueryInvocation } from "./parse-query-invocation"
import { parseTableDefinition } from "./parse-table-definition"

function compileTypeScript(filePath: string, fileContent: string) {
  try {
    return compileFiles([filePath])
  } catch (error) {
    const message = `Compiling TypeScript source file failed: ${error.message}`
    const sourceFile: SourceFile = { fileContent, filePath }
    reportDiagnostic(createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, null))
  }
}

function fail(message: string): never {
  throw new Error(message)
}

export function loadSourceFile(filePath: string): SourceFile {
  const fileContent = fs.readFileSync(filePath, "utf8")
  const program = filePath.endsWith(".ts") ? compileTypeScript(filePath, fileContent) : undefined

  return {
    fileContent,
    filePath,
    ts: program
      ? {
          program,
          sourceFile:
            program.getSourceFile(filePath) ||
            fail(`Cannot retrieve source file ${filePath} from compiled TypeScript sources.`)
        }
      : undefined
  }
}

export function parseSourceFile(sourceFile: SourceFile) {
  const queries: QueryInvocation[] = []
  const tableSchemas: TableSchema[] = []

  const ast = parse(sourceFile.fileContent, {
    filename: sourceFile.filePath,
    plugins: sourceFile.ts ? ["@babel/plugin-transform-typescript"] : [],
    sourceType: "unambiguous"
  })

  traverse(ast as any, {
    CallExpression(path) {
      const callee = path.get("callee")
      if (!callee.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(callee, "defineTable")
      if (!importSpecifier) return

      tableSchemas.push(parseTableDefinition(path, sourceFile))
    },
    TaggedTemplateExpression(path) {
      const tag = path.get("tag")
      if (!tag.isIdentifier()) return

      const importSpecifier = getReferencedNamedImport(tag, "sql")
      if (!importSpecifier) return

      const query = parseQuery(path.get("quasi"), sourceFile)
      queries.push(createQueryInvocation(query, path, sourceFile))
    }
  })

  return {
    queries,
    tableSchemas
  }
}
