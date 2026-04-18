import { randomUUID } from "node:crypto"

export type TreeIdGenerator = () => string

export function createTreeId(generateUUID: TreeIdGenerator = randomUUID): string {
  return `tree_${generateUUID().replaceAll("-", "")}`
}
