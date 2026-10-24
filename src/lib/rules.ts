// The server's field rules, so forms can say what's wrong before sending; the server checks
// again. The numbers and the pattern come from the OpenAPI schema (`pnpm gen:api` writes
// rules.gen.ts); only the wording is here.
import { USERNAME_MAX, USERNAME_MIN } from "@/api/rules.gen"

export { BROADCAST_MAX, BROADCAST_MIN, PASSWORD_MAX, PASSWORD_MIN, USERNAME_PATTERN } from "@/api/rules.gen"
export const USERNAME_HINT = `${USERNAME_MIN}-${USERNAME_MAX} letters, digits, _, - or .`
