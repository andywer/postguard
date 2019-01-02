#!/usr/bin/env node

const meow = require("meow")
const parser = require("pg-query-parser")

const cli = meow(`
  Usage
    # Read query from parameter:
    $ node ./parse-query.js "<SQL query>"

    # Read query from stdin:
    $ node ./parse-query.js -

  Options
    --help
`)

if (cli.input.length !== 1) {
  cli.showHelp()
  process.exit(0)
}

const query = cli.input[0]

if (query === "-") {
  readStdin(stdin => run(stdin))
  run()
} else {
  run(query)
}

function run(query) {
  const result = parser.parse(query)

  if (result.error) {
    console.error(`Syntax error at position ${result.error.cursorPosition}:`)
    console.error(" ", result.error.stack)
    process.exit(1)
  } else {
    process.stdout.write(JSON.stringify(result.query[0], null, 2))
  }
}

function readStdin(callback) {
  const stdin = ""
  process.stdin.setEncoding("utf8")

  process.stdin.on("readable", () => {
    const chunk = process.stdin.read()
    if (chunk !== null) {
      stdin += chunk
    }
  })

  process.stdin.on("end", () => {
    callback(stdin)
  })
}
