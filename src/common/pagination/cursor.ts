/** Keyset position of the last item on a page: history is ordered by (performed_at DESC, id DESC). */
export interface CursorPosition {
  performedAt: Date;
  id: string;
}

const MAX_CURSOR_LENGTH = 256;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to clients: base64url of a small JSON document, so the format can change without breaking them. */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ p: position.performedAt.toISOString(), i: position.id }),
  ).toString('base64url');
}

/** Returns null for anything that is not a cursor this API produced (callers answer INVALID_CURSOR). */
export function decodeCursor(cursor: string): CursorPosition | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !BASE64URL.test(cursor))
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { p, i } = parsed as Record<string, unknown>;
  if (typeof p !== 'string' || typeof i !== 'string' || !UUID.test(i)) return null;
  const performedAt = new Date(p);
  // Round-trip check: rejects non-ISO strings and dates JS would silently roll over (Feb 30 -> Mar 2).
  if (Number.isNaN(performedAt.getTime()) || performedAt.toISOString() !== p) return null;
  return { performedAt, id: i.toLowerCase() };
}
