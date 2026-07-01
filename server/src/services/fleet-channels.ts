/**
 * Shared session-key → messaging-channel inference.
 *
 * The same channel-parsing logic was copy-pasted (and drifted) across at least
 * four call sites — fleet-monitor cost-by-channel, fleet-report, fleet-intelligence,
 * and fleet-budget — with inconsistent coverage. The cost-by-channel copy was the
 * only complete one; the others silently lumped `:guild:` (group) and `cron:`
 * sessions into "other", mislabeling the report's top channel and skewing the
 * intelligence channel-concentration check. fleet-budget's per-channel matcher
 * only checked `:channel:<name>`, so a budget scoped to a pseudo-channel
 * (direct/group/cron) never matched any session and always read $0 spend.
 *
 * This module is the single source of truth.
 *
 * Session-key shapes:
 *   ...:channel:<name>:...  → the explicit channel name (line, telegram, …)
 *   ...:peer:...            → "direct" (1:1 DM)
 *   ...:guild:...           → "group"
 *   cron:...                → "cron" (scheduled run)
 *   anything else           → "other"
 */
export function inferChannelFromSessionKey(sessionKey: string | undefined | null): string {
  const key = sessionKey ?? "";
  if (key.includes(":channel:")) {
    const m = key.match(/:channel:(\w+)/);
    return m ? m[1] : "other";
  }
  if (key.includes(":peer:")) return "direct";
  if (key.includes(":guild:")) return "group";
  if (key.includes("cron:")) return "cron";
  return "other";
}
