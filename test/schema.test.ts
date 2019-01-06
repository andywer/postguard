import test from "ava"
import * as path from "path"
import { loadSourceFile, parseSourceFile } from "../src/parser"

const pathToFixture = (fileName: string) => path.join(__dirname, "_fixtures", fileName)

test("can parse a complex schema", t => {
  const { tableSchemas } = parseSourceFile(loadSourceFile(pathToFixture("schema.ts")))
  const schema = {
    tableName: tableSchemas[0].tableName,
    columnDescriptors: tableSchemas[0].columnDescriptors,
    columnNames: tableSchemas[0].columnNames
  }
  t.snapshot(schema)
})
