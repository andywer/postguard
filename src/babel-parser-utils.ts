import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"

export function getReferencedNamedImport (identifier: NodePath<types.Identifier>) {
  const binding = identifier.scope.getBinding(identifier.node.name)
  if (!binding || !binding.path.isImportSpecifier()) return

  return binding.path.get("imported")
}
