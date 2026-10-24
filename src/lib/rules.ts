// Mirrors the server's checks (lmoxide-db accounts.rs) so forms can say what's wrong before
// sending; the server checks again.
export const USERNAME_PATTERN = "[A-Za-z0-9_.\\-]{3,32}"
export const USERNAME_HINT = "3-32 letters, digits, _, - or ."
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
