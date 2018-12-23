export function containsToRegex(expectedToContain: string) {
  return new RegExp(expectedToContain.replace(/[\$\^\.\(\)\[\]\\]/g, match => `\\${match}`))
}
