/**
 * Makes user input match literally inside a LIKE pattern (Postgres' default escape character is "\").
 * Prisma's `contains` does not escape its argument, so "%" would otherwise match everything.
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
