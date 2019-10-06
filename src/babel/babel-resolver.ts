import { NodePath } from "@babel/traverse"
import * as types from "@babel/types"
import { ColumnDescriptor, Schema } from "squid/schema"
import { getReferencedNamedImport } from "./babel-imports"

const $descriptor = Symbol("Schema descriptor")

export const isDescriptor = (thing: any) => thing && typeof thing === "object" && thing[$descriptor]

export const markAsDescriptor = <T extends {}>(obj: T): T => {
  Object.defineProperty(obj, $descriptor, {
    enumerable: false,
    value: true
  })
  return obj
}

function getColumnNameByKey(key: NodePath<types.Node>): string {
  if (key.isIdentifier()) {
    return key.node.name
  } else {
    const name = key.evaluate().value
    if (!name) throw key.buildCodeFrameError("Cannot resolve property key value (column name).")
    return name
  }
}

function resolveCallExpression(
  call: NodePath<types.CallExpression>,
  fn: (...args: any[]) => any,
  args: NodePath[]
): ColumnDescriptor | any {
  const resolvedArgs = args.map(arg => resolveColumnDescriptorExpression(arg))

  try {
    const result = fn(...resolvedArgs)
    return result && typeof result === "object" && result.type ? markAsDescriptor(result) : result
  } catch (error) {
    throw call.buildCodeFrameError(
      `Call to ${call.get("callee").getSource()} failed: ${error.message}`
    )
  }
}

function resolveSchemaDotSomethingDescriptor(
  name: string,
  parentNodePath: NodePath
): ColumnDescriptor | any {
  const descriptor = (Schema as { [key: string]: any })[name]

  if (!descriptor) throw parentNodePath.buildCodeFrameError(`Schema.${name} is not known.`)

  if (typeof descriptor === "object") {
    return markAsDescriptor(descriptor)
  } else if (typeof descriptor === "function") {
    return descriptor
  } else {
    throw parentNodePath.buildCodeFrameError(
      `Schema.${name} is of unexpected type ${typeof descriptor}.`
    )
  }
}

function resolveSchemaDescriptorName(path: NodePath<types.MemberExpression>) {
  const object = path.get("object")
  const property = path.get("property")

  if (!object.isIdentifier()) throw object.buildCodeFrameError("Expected Schema.*")
  const schemaImport = getReferencedNamedImport(object, "Schema")

  if (!schemaImport) {
    throw object.buildCodeFrameError("Cannot parse schema. Please reference a Schema.* descriptor.")
  }
  if (Array.isArray(property) || !property.isIdentifier()) {
    throw path.buildCodeFrameError("Cannot parse schema.")
  }

  return property.node.name
}

export function resolveColumnDescriptorExpression(
  path: NodePath<types.Node>
): ColumnDescriptor | any {
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name)
    if (!binding) throw path.buildCodeFrameError(`Cannot resolve variable "${path.node.name}".`)

    if (binding.path.isVariableDeclarator()) {
      const init = binding.path.get("init")
      if (!init) {
        throw binding.path.buildCodeFrameError(
          `Expected ${binding.identifier.name} to reference some Schema.* descriptor.`
        )
      }
      return resolveColumnDescriptorExpression(init as NodePath)
    } else {
      throw binding.path.buildCodeFrameError(
        "Cannot parse referencing schema. Please reference a Schema.* descriptor."
      )
    }
  } else if (path.isMemberExpression()) {
    const propertyName = resolveSchemaDescriptorName(path)
    return resolveSchemaDotSomethingDescriptor(propertyName, path)
  } else if (path.isCallExpression()) {
    const callee = path.get("callee")
    const args = path.get("arguments")

    const resolvedCallee = resolveColumnDescriptorExpression(callee)
    if (typeof resolvedCallee !== "function") {
      throw callee.buildCodeFrameError(
        `Expected a function as callee, got ${typeof resolvedCallee}.`
      )
    }

    return resolveCallExpression(path, resolvedCallee, args)
  } else if (path.isArrayExpression()) {
    const elements = path.get("elements")

    for (const element of elements) {
      if (element.isSpreadElement()) {
        throw element.buildCodeFrameError("Array spread cannot be parsed.")
      }
    }

    return elements.map(element => resolveColumnDescriptorExpression(element as NodePath))
  } else if (path.isObjectExpression()) {
    const resolved: { [key: string]: any } = {}

    for (const property of path.get("properties")) {
      if (!property.isObjectProperty()) {
        throw property.buildCodeFrameError("Expected object property (no spread or method).")
      }

      const key = property.get("key")
      const value = property.get("value")

      if (Array.isArray(key)) {
        throw property.buildCodeFrameError("Did not expect property key to be an array.")
      }

      const columnName = getColumnNameByKey(key)
      resolved[columnName] = resolveColumnDescriptorExpression(value)
    }

    return resolved
  } else {
    const evaluated = path.evaluate()

    if (evaluated.confident) {
      return evaluated.value
    }
  }

  throw path.buildCodeFrameError(
    `Expected a Schema.* descriptor. Found an unhandled ${path.node.type} instead.`
  )
}
