import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import ts from "typescript"
import { createSourceFileDiagnostic, reportDiagnostic, DiagnosticType } from "../diagnostics"
import { Query, QueryInvocation, SourceFile } from "../types"
import { resolveTypeOfBabelPath } from "../typescript/file"
import { mapPropertyTypesToSchemaDescriptor, resolvePropertyTypes } from "../typescript/objectish"

function resolveTypeParamPropTypes(
  typeParameters: NodePath<types.TSTypeParameterInstantiation | null>,
  tsProgram: ts.Program,
  tsSource: ts.SourceFile,
  sourceFile: SourceFile
) {
  if (typeParameters.node) {
    const params = typeParameters.get("params")
    const paramTypes = Array.isArray(params) ? params : [params]

    if (paramTypes.length === 1) {
      const type = resolveTypeOfBabelPath(paramTypes[0].node, tsProgram, tsSource, sourceFile)
      const propTypes = type ? resolvePropertyTypes(tsProgram, type) : null
      return propTypes
    }
  }
  return null
}

export function createQueryInvocation(
  query: Query,
  path: NodePath<types.TaggedTemplateExpression>,
  sourceFile: SourceFile
): QueryInvocation {
  let resultTypeAssertion: QueryInvocation["resultTypeAssertion"]

  if (path.parentPath.isCallExpression() && sourceFile.ts) {
    const callExpression: NodePath<types.CallExpression> = path.parentPath
    const typeParameters = callExpression.get("typeParameters")

    const propTypes = resolveTypeParamPropTypes(
      typeParameters,
      sourceFile.ts.program,
      sourceFile.ts.sourceFile,
      sourceFile
    )

    if (propTypes && Object.keys(propTypes).length > 0) {
      const schema = mapPropertyTypesToSchemaDescriptor(propTypes)

      resultTypeAssertion = {
        path: typeParameters as NodePath<types.Node>,
        schema
      }
    } else if (typeParameters.node) {
      const { loc } = callExpression.node
      const message =
        `Cannot infer type of type parameter. Skipping type checking of this expression.\n` +
        `  Type parameter: ${typeParameters.getSource()}`
      reportDiagnostic(createSourceFileDiagnostic(DiagnosticType.warning, message, sourceFile, loc))
    } else {
      // No type params specified - Ignore
    }
  }

  return {
    query,
    resultTypeAssertion
  }
}
