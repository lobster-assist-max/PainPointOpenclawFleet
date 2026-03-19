/**
 * Fleet Prompt Lab API Routes
 *
 * Endpoints for prompt version management, diffing, genome analysis,
 * A/B testing of prompt variants, and cross-bot trait transfer
 * ("cross-pollination").
 */

import { randomUUID } from "node:crypto";
import { Router } from "express";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PromptVersion {
  version: number;
  identityMd: string;
  soulMd: string;
  changeDescription: string;
  createdBy: string;
  createdAt: string;
  hash: string;
}

export interface PromptGenomeTrait {
  trait: string;
  strength: number; // 0–100
  evidence: string[];
}

export interface PromptGenome {
  botId: string;
  version: number;
  traits: PromptGenomeTrait[];
  analyzedAt: string;
}

export type ABTestStatus = "running" | "completed" | "stopped";

export interface ABTestResult {
  testId: string;
  botId: string;
  controlVersion: number;
  treatmentVersion: number;
  trafficSplit: number;
  minSessions: number;
  status: ABTestStatus;
  startedAt: string;
  completedAt: string | null;
  controlMetrics: {
    sessions: number;
    avgSatisfaction: number;
    avgResolutionRate: number;
    avgResponseTime: number;
  };
  treatmentMetrics: {
    sessions: number;
    avgSatisfaction: number;
    avgResolutionRate: number;
    avgResponseTime: number;
  };
  winner: "control" | "treatment" | "inconclusive" | null;
  pValue: number | null;
}

export interface CrossPollinationResult {
  sourceBotId: string;
  targetBotId: string;
  traits: string[];
  mergedIdentityMd: string;
  mergedSoulMd: string;
  changeDescription: string;
  confidence: number;
}

// ─── In-memory stores ──────────────────────────────────────────────────────

/** botId → PromptVersion[] (sorted ascending by version) */
const versionStore = new Map<string, PromptVersion[]>();

/** testId → ABTestResult */
const abTestStore = new Map<string, ABTestResult>();

/** botId → PromptGenome (latest) */
const genomeStore = new Map<string, PromptGenome>();

// ─── Helpers ───────────────────────────────────────────────────────────────

function simpleHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

function computeLineDiff(
  a: string,
  b: string,
): { added: string[]; removed: string[]; unchanged: number } {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);

  const added = bLines.filter((l) => !aSet.has(l));
  const removed = aLines.filter((l) => !bSet.has(l));
  const unchanged = aLines.filter((l) => bSet.has(l)).length;

  return { added, removed, unchanged };
}

/**
 * Very simplified genome extraction — in production this would use
 * NLP/LLM analysis on the identity and soul markdown.
 */
function extractGenome(identityMd: string, soulMd: string): PromptGenomeTrait[] {
  const combined = `${identityMd}\n${soulMd}`.toLowerCase();
  const traits: PromptGenomeTrait[] = [];

  const traitPatterns: Array<{ trait: string; keywords: string[] }> = [
    { trait: "empathy", keywords: ["empathy", "empathetic", "caring", "compassion", "understand"] },
    { trait: "formality", keywords: ["formal", "professional", "polite", "courteous", "respectful"] },
    { trait: "humor", keywords: ["humor", "funny", "joke", "witty", "playful", "lightheart"] },
    { trait: "brevity", keywords: ["concise", "brief", "short", "succinct", "to the point"] },
    { trait: "technical_depth", keywords: ["technical", "detailed", "in-depth", "expert", "thorough"] },
    { trait: "creativity", keywords: ["creative", "imaginative", "innovative", "original"] },
    { trait: "assertiveness", keywords: ["assertive", "direct", "confident", "decisive", "firm"] },
    { trait: "patience", keywords: ["patient", "calm", "gentle", "take your time", "no rush"] },
  ];

  for (const pattern of traitPatterns) {
    const matchCount = pattern.keywords.reduce((count, kw) => {
      const regex = new RegExp(kw, "gi");
      const matches = combined.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);

    if (matchCount > 0) {
      const strength = Math.min(100, matchCount * 20);
      traits.push({
        trait: pattern.trait,
        strength,
        evidence: pattern.keywords.filter((kw) =>
          combined.includes(kw),
        ),
      });
    }
  }

  // Always include a baseline set so the genome chart is useful
  const existing = new Set(traits.map((t) => t.trait));
  for (const pattern of traitPatterns) {
    if (!existing.has(pattern.trait)) {
      traits.push({ trait: pattern.trait, strength: 0, evidence: [] });
    }
  }

  return traits.sort((a, b) => a.trait.localeCompare(b.trait));
}

// ─── Router ────────────────────────────────────────────────────────────────

export function fleetPromptRoutes() {
  const router = Router();

  /**
   * GET /api/fleet-monitor/prompts/:botId/versions
   * List all prompt versions for a bot, newest first.
   */
  router.get("/prompts/:botId/versions", (req, res) => {
    const { botId } = req.params;
    const versions = versionStore.get(botId) ?? [];

    res.json({
      ok: true,
      botId,
      versions: [...versions].reverse().map((v) => ({
        version: v.version,
        changeDescription: v.changeDescription,
        createdBy: v.createdBy,
        createdAt: v.createdAt,
        hash: v.hash,
      })),
      total: versions.length,
    });
  });

  /**
   * POST /api/fleet-monitor/prompts/:botId/versions
   * Create a new prompt version for a bot.
   *
   * Body: { identityMd, soulMd, changeDescription, createdBy }
   */
  router.post("/prompts/:botId/versions", (req, res) => {
    const { botId } = req.params;
    const { identityMd, soulMd, changeDescription, createdBy } = req.body ?? {};

    if (!identityMd || !soulMd) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: identityMd, soulMd",
      });
      return;
    }

    if (!changeDescription || !createdBy) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: changeDescription, createdBy",
      });
      return;
    }

    const existing = versionStore.get(botId) ?? [];
    const nextVersion = existing.length > 0 ? existing[existing.length - 1].version + 1 : 1;

    const version: PromptVersion = {
      version: nextVersion,
      identityMd,
      soulMd,
      changeDescription,
      createdBy,
      createdAt: new Date().toISOString(),
      hash: simpleHash(identityMd + soulMd),
    };

    existing.push(version);
    versionStore.set(botId, existing);

    res.status(201).json({ ok: true, version });
  });

  /**
   * GET /api/fleet-monitor/prompts/:botId/versions/:v
   * Get full content of a specific prompt version.
   */
  router.get("/prompts/:botId/versions/:v", (req, res) => {
    const { botId } = req.params;
    const v = parseInt(req.params.v, 10);

    if (isNaN(v)) {
      res.status(400).json({ ok: false, error: "Invalid version number" });
      return;
    }

    const versions = versionStore.get(botId) ?? [];
    const version = versions.find((ver) => ver.version === v);

    if (!version) {
      res.status(404).json({ ok: false, error: `Version ${v} not found for bot ${botId}` });
      return;
    }

    res.json({ ok: true, version });
  });

  /**
   * POST /api/fleet-monitor/prompts/:botId/diff
   * Compare two prompt versions and return a line-level diff.
   *
   * Body: { from, to }
   */
  router.post("/prompts/:botId/diff", (req, res) => {
    const { botId } = req.params;
    const { from, to } = req.body ?? {};

    if (from == null || to == null) {
      res.status(400).json({ ok: false, error: "Missing required fields: from, to" });
      return;
    }

    const fromV = parseInt(String(from), 10);
    const toV = parseInt(String(to), 10);

    if (isNaN(fromV) || isNaN(toV)) {
      res.status(400).json({ ok: false, error: "from and to must be valid version numbers" });
      return;
    }

    const versions = versionStore.get(botId) ?? [];
    const fromVersion = versions.find((v) => v.version === fromV);
    const toVersion = versions.find((v) => v.version === toV);

    if (!fromVersion) {
      res.status(404).json({ ok: false, error: `Version ${fromV} not found` });
      return;
    }
    if (!toVersion) {
      res.status(404).json({ ok: false, error: `Version ${toV} not found` });
      return;
    }

    const identityDiff = computeLineDiff(fromVersion.identityMd, toVersion.identityMd);
    const soulDiff = computeLineDiff(fromVersion.soulMd, toVersion.soulMd);

    res.json({
      ok: true,
      botId,
      from: fromV,
      to: toV,
      identity: {
        added: identityDiff.added,
        removed: identityDiff.removed,
        unchanged: identityDiff.unchanged,
      },
      soul: {
        added: soulDiff.added,
        removed: soulDiff.removed,
        unchanged: soulDiff.unchanged,
      },
    });
  });

  /**
   * POST /api/fleet-monitor/prompts/:botId/genome
   * Analyze the "prompt genome" — extract personality traits and strengths
   * from the latest (or specified) version's identity and soul markdown.
   *
   * Body: { version? } — optional, defaults to latest
   */
  router.post("/prompts/:botId/genome", (req, res) => {
    const { botId } = req.params;
    const requestedVersion = req.body?.version != null
      ? parseInt(String(req.body.version), 10)
      : null;

    const versions = versionStore.get(botId) ?? [];

    if (versions.length === 0) {
      res.status(404).json({ ok: false, error: "No prompt versions found for this bot" });
      return;
    }

    const target = requestedVersion != null
      ? versions.find((v) => v.version === requestedVersion)
      : versions[versions.length - 1];

    if (!target) {
      res.status(404).json({ ok: false, error: `Version ${requestedVersion} not found` });
      return;
    }

    const traits = extractGenome(target.identityMd, target.soulMd);

    const genome: PromptGenome = {
      botId,
      version: target.version,
      traits,
      analyzedAt: new Date().toISOString(),
    };

    genomeStore.set(botId, genome);

    res.json({ ok: true, genome });
  });

  /**
   * POST /api/fleet-monitor/prompts/:botId/test
   * Start an A/B test between two prompt versions.
   *
   * Body: { controlVersion, treatmentVersion, trafficSplit, minSessions }
   */
  router.post("/prompts/:botId/test", (req, res) => {
    const { botId } = req.params;
    const { controlVersion, treatmentVersion, trafficSplit, minSessions } = req.body ?? {};

    if (controlVersion == null || treatmentVersion == null) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: controlVersion, treatmentVersion",
      });
      return;
    }

    const ctrlV = parseInt(String(controlVersion), 10);
    const treatV = parseInt(String(treatmentVersion), 10);

    if (isNaN(ctrlV) || isNaN(treatV)) {
      res.status(400).json({
        ok: false,
        error: "controlVersion and treatmentVersion must be valid numbers",
      });
      return;
    }

    const versions = versionStore.get(botId) ?? [];
    if (!versions.find((v) => v.version === ctrlV)) {
      res.status(404).json({ ok: false, error: `Control version ${ctrlV} not found` });
      return;
    }
    if (!versions.find((v) => v.version === treatV)) {
      res.status(404).json({ ok: false, error: `Treatment version ${treatV} not found` });
      return;
    }

    const split = typeof trafficSplit === "number" ? Math.max(0.1, Math.min(0.9, trafficSplit)) : 0.5;
    const sessions = typeof minSessions === "number" ? Math.max(10, minSessions) : 100;

    const testId = randomUUID();
    const test: ABTestResult = {
      testId,
      botId,
      controlVersion: ctrlV,
      treatmentVersion: treatV,
      trafficSplit: split,
      minSessions: sessions,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      controlMetrics: {
        sessions: 0,
        avgSatisfaction: 0,
        avgResolutionRate: 0,
        avgResponseTime: 0,
      },
      treatmentMetrics: {
        sessions: 0,
        avgSatisfaction: 0,
        avgResolutionRate: 0,
        avgResponseTime: 0,
      },
      winner: null,
      pValue: null,
    };

    abTestStore.set(testId, test);

    res.status(201).json({ ok: true, test });
  });

  /**
   * GET /api/fleet-monitor/prompts/:botId/test/:testId
   * Get A/B test results.
   */
  router.get("/prompts/:botId/test/:testId", (req, res) => {
    const { botId, testId } = req.params;
    const test = abTestStore.get(testId);

    if (!test) {
      res.status(404).json({ ok: false, error: "Test not found" });
      return;
    }

    if (test.botId !== botId) {
      res.status(404).json({ ok: false, error: "Test does not belong to this bot" });
      return;
    }

    res.json({ ok: true, test });
  });

  /**
   * POST /api/fleet-monitor/prompts/crosspolinate
   * Cross-bot trait transfer: extract traits from a source bot's prompt
   * and merge them into the target bot's latest prompt version.
   *
   * Body: { sourceBotId, targetBotId, traits }
   */
  router.post("/prompts/crosspolinate", (req, res) => {
    const { sourceBotId, targetBotId, traits } = req.body ?? {};

    if (!sourceBotId || !targetBotId) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: sourceBotId, targetBotId",
      });
      return;
    }

    if (!traits || !Array.isArray(traits) || traits.length === 0) {
      res.status(400).json({
        ok: false,
        error: "Missing or empty required field: traits (string[])",
      });
      return;
    }

    const sourceVersions = versionStore.get(sourceBotId) ?? [];
    const targetVersions = versionStore.get(targetBotId) ?? [];

    if (sourceVersions.length === 0) {
      res.status(404).json({ ok: false, error: `No prompt versions found for source bot ${sourceBotId}` });
      return;
    }

    if (targetVersions.length === 0) {
      res.status(404).json({ ok: false, error: `No prompt versions found for target bot ${targetBotId}` });
      return;
    }

    const sourceLatest = sourceVersions[sourceVersions.length - 1];
    const targetLatest = targetVersions[targetVersions.length - 1];

    // Extract trait-related lines from source
    const sourceLines = `${sourceLatest.identityMd}\n${sourceLatest.soulMd}`.split("\n");
    const traitLines: string[] = [];
    for (const trait of traits) {
      const lower = trait.toLowerCase();
      for (const line of sourceLines) {
        if (line.toLowerCase().includes(lower) && !traitLines.includes(line)) {
          traitLines.push(line);
        }
      }
    }

    // Append trait lines to target's markdown
    const traitSection = traitLines.length > 0
      ? `\n\n<!-- Cross-pollinated from ${sourceBotId}: ${traits.join(", ")} -->\n${traitLines.join("\n")}`
      : "";

    const mergedIdentityMd = targetLatest.identityMd + traitSection;
    const mergedSoulMd = targetLatest.soulMd;

    const result: CrossPollinationResult = {
      sourceBotId,
      targetBotId,
      traits,
      mergedIdentityMd,
      mergedSoulMd,
      changeDescription: `Cross-pollinated traits [${traits.join(", ")}] from ${sourceBotId}`,
      confidence: traitLines.length > 0 ? Math.min(0.95, 0.5 + traitLines.length * 0.1) : 0.2,
    };

    res.json({ ok: true, result });
  });

  return router;
}
