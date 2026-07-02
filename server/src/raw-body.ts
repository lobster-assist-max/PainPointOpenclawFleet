import type { Request } from "express";

/**
 * Return the raw (un-parsed) request body bytes as a UTF-8 string.
 *
 * HMAC webhook signatures are computed by the SENDER over the exact bytes it
 * transmitted, so verification must run against those same bytes — NOT
 * `JSON.stringify(req.body)`, which re-serializes the *parsed* object and will
 * not byte-match the sender (key order, whitespace, and unicode/number
 * formatting all differ). Signing over the re-serialized form makes a
 * correctly-signed webhook fail verification.
 *
 * The raw Buffer is stashed as `req.rawBody` by the global `bodyParser.json`
 * `verify` callback in app.ts. Returns "" when unavailable, so HMAC checks
 * fail closed (reject) rather than pass over the wrong bytes.
 *
 * Mirrors the pattern already used for plugin webhook delivery in
 * `routes/plugins.ts`.
 */
export function readRawBody(req: Request): string {
  const stashed =
    "rawBody" in req ? (req as { rawBody?: Buffer }).rawBody : undefined;
  return Buffer.isBuffer(stashed) ? stashed.toString("utf-8") : "";
}
