import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"

function isRequireCall (path: NodePath<types.CallExpression>) {
  const callee = path.get("callee")
  return callee.isIdentifier() && callee.node.name === "require" && !callee.scope.getBinding("require")
}

export function getReferencedNamedImport (identifier: NodePath<types.Identifier>): NodePath<types.Identifier> | undefined {
  const binding = identifier.scope.getBinding(identifier.node.name)
  if (!binding) return

  const bindingPath = binding.path

  if (bindingPath.isImportSpecifier()) {
    // import { sql } from "..."
    return bindingPath.get("imported")
  }

  if (bindingPath.isVariableDeclarator() && bindingPath.get("init").isCallExpression()) {
    const init = bindingPath.get("init") as NodePath<types.CallExpression>

    if (isRequireCall(init) && bindingPath.get("id").isObjectPattern()) {
      // const { sql } = require("...")
      const destructuring = bindingPath.get("id") as NodePath<types.ObjectPattern>
      for (const property of destructuring.get("properties")) {
        if (property.isObjectProperty() &&
            !Array.isArray(property.get("key")) &&
            (property.get("key") as NodePath<types.Node>).isIdentifier() &&
            (property.get("key") as NodePath<types.Identifier>).node.name === binding.identifier.name
        ) {
          return (property.get("key") as NodePath<types.Identifier>)
        }
      }
    }
  }

  if (bindingPath.isVariableDeclarator() && bindingPath.get("id").isIdentifier() && bindingPath.get("init").isMemberExpression()) {
    const id = bindingPath.get("id") as NodePath<types.Identifier>
    const init = bindingPath.get("init") as NodePath<types.MemberExpression>
    const initObject = init.get("object")
    const initProp = init.get("property")

    if (id.node.name === binding.identifier.name && initObject.isCallExpression() && isRequireCall(initObject)) {
      if (!Array.isArray(initProp) && initProp.isIdentifier() && initProp.node.name === binding.identifier.name) {
        return id
      } else if (!Array.isArray(initProp) && initProp.isStringLiteral() && initProp.node.value === binding.identifier.name) {
        return id
      }
    }
  }

  return undefined
}
