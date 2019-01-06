import { Query } from "./types"

function flatMap<In, Out>(elements: In[], mapper: (element: In) => Out[]): Out[] {
  return elements.reduce((flattened, element) => [...flattened, ...mapper(element)], [] as Out[])
}

export function getAllSubqueries(query: Query): Query[] {
  return flatMap(query.subqueries, subquery =>
    // Order is important here: Deepest first
    [...getAllSubqueries(subquery), subquery]
  )
}
