import ts from "typescript"

const isObjectType = (type: ts.Type): type is ts.ObjectType =>
  Boolean(type.flags & ts.TypeFlags.Object)

const getTypeElementName = (element: ts.TypeElement) => {
  const name = element.name
  if (!name) return null

  if (ts.isComputedPropertyName(name)) {
    return null
  } else {
    return name.text
  }
}

function getObjectTypeProperties(
  program: ts.Program,
  type: ts.ObjectType
): { [key: string]: ts.Type } {
  const checker = program.getTypeChecker()
  const typeNode = checker.typeToTypeNode(type)

  const members: ts.NodeArray<ts.TypeElement> =
    typeNode && typeNode.kind === ts.SyntaxKind.TypeLiteral
      ? (typeNode as ts.TypeLiteralNode).members
      : ts.createNodeArray([])

  return type.getProperties().reduce((propertiesObject, propertySymbol) => {
    const propTypeNode = members.find(member => getTypeElementName(member) === propertySymbol.name)
    const propType = propTypeNode ? ((propTypeNode as any).type as ts.TypeNode) : null
    return {
      ...propertiesObject,
      [propertySymbol.getName()]: propType
    }
  }, {})
}

export function getProperties(
  program: ts.Program,
  type: ts.Type
): { [key: string]: ts.Type } | null {
  if (type.isIntersection()) {
    return type.types.reduce<{ [key: string]: ts.Type }>(
      // TODO: Don't just override previous property type
      (reduced, subType) => ({
        ...reduced,
        ...getProperties(program, subType)
      }),
      {}
    )
  }

  if (!isObjectType(type)) return null

  const inheritedTypes: ts.BaseType[] =
    type.objectFlags & ts.ObjectFlags.Interface
      ? (type as ts.InterfaceType).getBaseTypes() || []
      : []

  const inheritedObjectTypes = inheritedTypes.filter(isObjectType) as ts.ObjectType[]

  return [...inheritedObjectTypes, type].reduce(
    (propertiesObject, someType) => ({
      ...propertiesObject,
      ...getObjectTypeProperties(program, someType)
    }),
    {}
  )
}
