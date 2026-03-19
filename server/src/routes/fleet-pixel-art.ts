/**
 * Fleet Pixel Art Forge API Routes
 *
 * Generates deterministic pixel art avatars for bots based on their
 * identity and role, using Pain Point brand colors.
 */

import { Router } from "express";
import { generateBotAvatar, getRolePalette, getAvailableRoles } from "../services/fleet-pixel-art-forge.js";

export function fleetPixelArtRoutes() {
  const router = Router();

  /**
   * GET /api/fleet-pixel-art/:botId/avatar
   * Generate a pixel art avatar SVG for a bot.
   * Query: ?role=customer_service&seed=custom-seed
   */
  router.get("/:botId/avatar", (req, res) => {
    const { botId } = req.params;
    const role = typeof req.query.role === "string" ? req.query.role : "general";
    const seed = typeof req.query.seed === "string" ? req.query.seed : undefined;

    const result = generateBotAvatar(botId, role, seed);

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h
    res.send(result.svg);
  });

  /**
   * GET /api/fleet-pixel-art/:botId/avatar.json
   * Get avatar metadata (SVG + palette + pattern info).
   */
  router.get("/:botId/avatar.json", (req, res) => {
    const { botId } = req.params;
    const role = typeof req.query.role === "string" ? req.query.role : "general";
    const seed = typeof req.query.seed === "string" ? req.query.seed : undefined;

    const result = generateBotAvatar(botId, role, seed);
    res.json({ ok: true, ...result });
  });

  /**
   * GET /api/fleet-pixel-art/palettes
   * List all available role palettes.
   */
  router.get("/palettes", (_req, res) => {
    const roles = getAvailableRoles();
    const palettes = Object.fromEntries(roles.map((r) => [r, getRolePalette(r)]));
    res.json({ ok: true, palettes });
  });

  return router;
}
