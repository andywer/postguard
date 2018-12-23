import chalk from "chalk"

export const error = (string: string) => chalk.redBright(string)
export const sourceReference = (string: string) => chalk.blueBright(string)
export const success = (string: string) => chalk.greenBright(string)
export const warning = (string: string) => chalk.keyword("orange")(string)
