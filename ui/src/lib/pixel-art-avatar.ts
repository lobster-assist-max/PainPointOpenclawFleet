/**
 * Pixel-art avatar helper.
 *
 * Builds the URL for the Fleet Pixel Art Forge endpoint
 * (`GET /api/fleet-pixel-art/:botId/avatar`), which returns a deterministic
 * SVG avatar generated from the bot's id (shape) and role palette.
 *
 * Used as the avatar placeholder when a bot has no uploaded avatar — gives
 * every bot a distinct, brand-coloured square instead of a bland emoji tile.
 */

/**
 * Map a fleet role ID (e.g. "head-engineering", "sr-engineer", "cmo") onto one
 * of the forge's 7 palette categories so a bot's avatar colour reflects its
 * department. The forge falls back to "general" for anything it doesn't know,
 * but the role IDs the UI uses ("cto", "head-sales", …) rarely match those keys
 * directly, so without this mapping almost every bot would render in the same
 * neutral palette.
 */
export function rolePaletteForRoleId(roleId?: string | null): string {
  const id = (roleId ?? "").toLowerCase();
  if (!id) return "general";
  if (id === "ceo") return "ceo";
  if (/(eng|research|cto|cio|developer|dev\b|architect)/.test(id)) return "engineering";
  if (/(sales|biz|account|revenue)/.test(id)) return "sales";
  if (/(market|content|design|cmo|brand|growth|social)/.test(id)) return "marketing";
  if (/(cs\b|customer|support|success|help)/.test(id)) return "customer_service";
  if (/(ops|operation|hr|coo|cfo|finance|legal|admin|people)/.test(id)) return "operations";
  return "general";
}

export function pixelArtAvatarUrl(botId: string, roleId?: string | null): string {
  const role = rolePaletteForRoleId(roleId);
  return `/api/fleet-pixel-art/${encodeURIComponent(botId)}/avatar?role=${encodeURIComponent(role)}`;
}
