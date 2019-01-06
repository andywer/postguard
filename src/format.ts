import chalk from "chalk"

export const error = (text: string) => chalk.redBright(text)
export const gray = (text: string) => chalk.gray(text)
export const sourceReference = (text: string) => chalk.blueBright(text)
export const success = (text: string) => chalk.greenBright(text)
export const warning = (text: string) => chalk.keyword("orange")(text)
