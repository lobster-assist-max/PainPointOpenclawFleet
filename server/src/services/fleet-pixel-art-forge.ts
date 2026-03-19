/**
 * FleetPixelArtForge — Procedural pixel art avatar generator for bots.
 *
 * Generates deterministic 16x16 pixel art avatars based on:
 * - Bot ID (hash → seed)
 * - Bot role → color palette
 * - Bot icon emoji → base shape
 * - Pain Point brand colors as foundation
 *
 * Output: SVG string (can be rendered inline or converted to PNG).
 */

import crypto from "node:crypto";

// ─── Pain Point Brand Colors ──────────────────────────────────────────────

const BRAND = {
  primary: "#D4A373",    // gold-brown
  secondary: "#B08968",  // muted tan
  foreground: "#2C2420", // deep espresso
  background: "#FAF9F6", // off-white cream
  tealDark: "#264653",   // informational
  tealMedium: "#2A9D8F", // informational accent
} as const;

// ─── Role → Palette mapping ──────────────────────────────────────────────

export interface PixelPalette {
  primary: string;
  secondary: string;
  accent: string;
  outline: string;
  background: string;
}

const ROLE_PALETTES: Record<string, PixelPalette> = {
  customer_service: {
    primary: BRAND.tealMedium,
    secondary: BRAND.tealDark,
    accent: BRAND.primary,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  sales: {
    primary: BRAND.primary,
    secondary: BRAND.secondary,
    accent: BRAND.tealMedium,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  engineering: {
    primary: BRAND.tealDark,
    secondary: BRAND.tealMedium,
    accent: BRAND.primary,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  marketing: {
    primary: BRAND.secondary,
    secondary: BRAND.primary,
    accent: BRAND.tealMedium,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  operations: {
    primary: "#9A7B5B",
    secondary: BRAND.foreground,
    accent: BRAND.primary,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  ceo: {
    primary: BRAND.foreground,
    secondary: BRAND.primary,
    accent: "#FFD700",
    outline: BRAND.foreground,
    background: BRAND.background,
  },
  general: {
    primary: BRAND.primary,
    secondary: BRAND.secondary,
    accent: BRAND.tealMedium,
    outline: BRAND.foreground,
    background: BRAND.background,
  },
};

// ─── Pixel Grid Patterns ──────────────────────────────────────────────────

// 8x8 base shapes (mirrored horizontally to make 16x16)
// 0=transparent, 1=outline, 2=primary, 3=secondary, 4=accent
type PixelValue = 0 | 1 | 2 | 3 | 4;

// Base creature patterns (8x8 half, mirrored for symmetry)
const CREATURE_PATTERNS: PixelValue[][] = [
  // Pattern 0: Rounded bot
  [
    0, 0, 1, 1, 1, 1, 0, 0,
    0, 1, 2, 2, 2, 2, 1, 0,
    1, 2, 4, 2, 2, 4, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 2, 3, 3, 2, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 0, 1, 1, 1, 1, 0, 0,
  ],
  // Pattern 1: Spiky bot
  [
    0, 1, 0, 0, 0, 0, 1, 0,
    1, 2, 1, 0, 0, 1, 2, 1,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 1, 4, 2, 2, 4, 1, 0,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 1, 2, 3, 3, 2, 1, 0,
    1, 2, 1, 2, 2, 1, 2, 1,
    0, 1, 0, 1, 1, 0, 1, 0,
  ],
  // Pattern 2: Square bot
  [
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 4, 2, 2, 4, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
  ],
  // Pattern 3: Diamond bot
  [
    0, 0, 0, 1, 1, 0, 0, 0,
    0, 0, 1, 2, 2, 1, 0, 0,
    0, 1, 2, 4, 4, 2, 1, 0,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    0, 1, 2, 3, 3, 2, 1, 0,
    0, 0, 1, 2, 2, 1, 0, 0,
    0, 0, 0, 1, 1, 0, 0, 0,
  ],
  // Pattern 4: Blob creature
  [
    0, 0, 1, 1, 1, 0, 0, 0,
    0, 1, 2, 2, 2, 1, 0, 0,
    1, 2, 4, 2, 2, 2, 1, 0,
    1, 2, 2, 2, 2, 2, 2, 1,
    1, 2, 2, 2, 2, 2, 2, 1,
    0, 1, 2, 3, 2, 2, 1, 0,
    0, 1, 2, 2, 2, 1, 0, 0,
    0, 0, 1, 1, 1, 0, 0, 0,
  ],
];

// ─── Hash-based seeding ───────────────────────────────────────────────────

function hashToSeed(input: string): number[] {
  const hash = crypto.createHash("sha256").update(input).digest();
  const seeds: number[] = [];
  for (let i = 0; i < hash.length; i++) {
    seeds.push(hash[i]!);
  }
  return seeds;
}

// ─── SVG Generation ───────────────────────────────────────────────────────

function generateSvg(
  grid: PixelValue[],
  palette: PixelPalette,
  size: number,
  pixelSize: number,
): string {
  const svgSize = size * pixelSize;
  let rects = "";

  const colorMap: Record<PixelValue, string | null> = {
    0: null, // transparent
    1: palette.outline,
    2: palette.primary,
    3: palette.secondary,
    4: palette.accent,
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = grid[y * size + x];
      if (pixel === undefined) continue;
      const color = colorMap[pixel];
      if (!color) continue;

      rects += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">${rects}</svg>`;
}

// ─── Mutate pattern based on seed ─────────────────────────────────────────

function mutatePattern(basePattern: PixelValue[], seeds: number[]): PixelValue[] {
  const result = [...basePattern];

  // Use seed bytes to flip some pixels
  for (let i = 0; i < Math.min(seeds.length, 16); i++) {
    const byte = seeds[i]!;
    const idx = byte % result.length;
    const currentPixel = result[idx];

    // Only mutate non-outline pixels
    if (currentPixel === 0 || currentPixel === 1) continue;

    // Cycle between primary(2), secondary(3), accent(4)
    const options: PixelValue[] = [2, 3, 4];
    result[idx] = options[byte % options.length]!;
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface PixelArtResult {
  svg: string;
  palette: PixelPalette;
  patternIndex: number;
  seed: string;
}

export function generateBotAvatar(
  botId: string,
  role: string = "general",
  customSeed?: string,
): PixelArtResult {
  const seed = customSeed ?? botId;
  const seeds = hashToSeed(seed);

  // Select base pattern from seed
  const patternIndex = seeds[0]! % CREATURE_PATTERNS.length;
  const basePattern = CREATURE_PATTERNS[patternIndex]!;

  // Get palette for role
  const palette = ROLE_PALETTES[role] ?? ROLE_PALETTES.general!;

  // Mutate pattern with seed for uniqueness
  const mutated = mutatePattern(basePattern, seeds.slice(1));

  // Generate SVG (8x8 grid, 4px per pixel = 32x32 SVG)
  const svg = generateSvg(mutated, palette, 8, 4);

  return { svg, palette, patternIndex, seed };
}

export function getRolePalette(role: string): PixelPalette {
  return ROLE_PALETTES[role] ?? ROLE_PALETTES.general!;
}

export function getAvailableRoles(): string[] {
  return Object.keys(ROLE_PALETTES);
}
