/**
 * Fleet Prompt Lab — Manage, version, analyze, and A/B-test bot prompts.
 *
 * Capabilities:
 * - Version control for IDENTITY.md / SOUL.md per bot
 * - Line-based diff between any two versions
 * - Genome analysis: extract behavioural traits via keyword/pattern matching
 * - A/B testing: split traffic between prompt versions, track CQI metrics
 * - Cross-pollination: suggest trait transfers between bots
 * - Quality scoring: aggregate CQI metrics into prompt effectiveness scores
 */

import { EventEmitter } from "events";
import { logger } from "../middleware/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptGenome {
  traits: Array<{ name: string; score: number; evidence: string[] }>;
  knowledgeDomains: Array<{ domain: string; coverage: number }>;
  languageProfile: {
    primaryLanguage: string;
    formality: number;
    emotionalExpressiveness: number;
  };
}

export interface PromptVersion {
  id: string;
  botId: string;
  version: number;
  createdAt: Date;
  createdBy: string;
  content: { identityMd: string; soulMd?: string };
  tags: string[];
  changeDescription: string;
  metrics?: {
    sessionCount: number;
    avgCqi: number;
    avgSentiment: number;
  };
  genome?: PromptGenome;
}

export interface PromptABTest {
  id: string;
  botId: string;
  status: "running" | "completed" | "cancelled";
  config: {
    controlVersion: number;
    treatmentVersion: number;
    trafficSplit: number; // 0-1, fraction going to treatment
    minSessions: number;
    successMetric: string;
  };
  results?: {
    controlMetrics: { sessions: number; avgCqi: number };
    treatmentMetrics: { sessions: number; avgCqi: number };
    pValue: number;
    lift: number;
    recommendation: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  lineNumber: number;
  content: string;
}

export interface PromptDiff {
  fromVersion: number;
  toVersion: number;
  botId: string;
  lines: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

export interface CrossPollinationSuggestion {
  sourceBotId: string;
  targetBotId: string;
  trait: string;
  sourceScore: number;
  targetScore: number;
  gap: number;
  suggestion: string;
}

export interface PromptQualityScore {
  botId: string;
  version: number;
  overall: number;
  breakdown: {
    clarity: number;
    completeness: number;
    consistency: number;
    effectiveness: number;
  };
  recommendations: string[];
  scoredAt: Date;
}

// ─── Trait keyword dictionaries ──────────────────────────────────────────────

interface TraitDictionary {
  name: string;
  keywords: Array<{ word: string; weight: number }>;
  patterns: Array<{ regex: RegExp; weight: number }>;
}

const TRAIT_DICTIONARIES: TraitDictionary[] = [
  {
    name: "empathy",
    keywords: [
      { word: "empathy", weight: 8 },
      { word: "empathetic", weight: 8 },
      { word: "understand", weight: 4 },
      { word: "understanding", weight: 5 },
      { word: "compassion", weight: 7 },
      { word: "compassionate", weight: 7 },
      { word: "feel", weight: 3 },
      { word: "feeling", weight: 4 },
      { word: "emotion", weight: 5 },
      { word: "emotional", weight: 5 },
      { word: "care", weight: 4 },
      { word: "caring", weight: 5 },
      { word: "supportive", weight: 6 },
      { word: "patient", weight: 5 },
      { word: "gentle", weight: 4 },
      { word: "kind", weight: 4 },
      { word: "kindness", weight: 5 },
      { word: "listen", weight: 4 },
      { word: "acknowledge", weight: 5 },
      // Chinese
      { word: "理解", weight: 6 },
      { word: "感受", weight: 6 },
      { word: "共情", weight: 8 },
      { word: "关心", weight: 5 },
      { word: "关怀", weight: 6 },
      { word: "体谅", weight: 6 },
      { word: "温暖", weight: 5 },
    ],
    patterns: [
      { regex: /I understand (how|what|that) you/gi, weight: 10 },
      { regex: /I('m| am) here (for|to help) you/gi, weight: 8 },
      { regex: /that must (be|feel)/gi, weight: 6 },
    ],
  },
  {
    name: "formality",
    keywords: [
      { word: "formal", weight: 8 },
      { word: "professional", weight: 7 },
      { word: "respectful", weight: 6 },
      { word: "polite", weight: 6 },
      { word: "courteous", weight: 6 },
      { word: "sir", weight: 4 },
      { word: "madam", weight: 4 },
      { word: "appropriate", weight: 3 },
      { word: "protocol", weight: 5 },
      { word: "etiquette", weight: 5 },
      { word: "dignified", weight: 5 },
      { word: "proper", weight: 4 },
      // Chinese
      { word: "您", weight: 6 },
      { word: "尊敬", weight: 7 },
      { word: "正式", weight: 7 },
      { word: "礼貌", weight: 6 },
      { word: "专业", weight: 5 },
      { word: "敬语", weight: 7 },
    ],
    patterns: [
      { regex: /please\b/gi, weight: 2 },
      { regex: /thank you/gi, weight: 2 },
      { regex: /would you (kindly|mind)/gi, weight: 5 },
      { regex: /I would be (happy|pleased) to/gi, weight: 5 },
    ],
  },
  {
    name: "technical_depth",
    keywords: [
      { word: "technical", weight: 6 },
      { word: "detailed", weight: 5 },
      { word: "specific", weight: 4 },
      { word: "precise", weight: 5 },
      { word: "accurate", weight: 5 },
      { word: "algorithm", weight: 7 },
      { word: "implementation", weight: 6 },
      { word: "architecture", weight: 6 },
      { word: "code", weight: 5 },
      { word: "API", weight: 5 },
      { word: "debug", weight: 5 },
      { word: "optimize", weight: 5 },
      { word: "performance", weight: 4 },
      { word: "documentation", weight: 4 },
      { word: "specification", weight: 5 },
      { word: "engineering", weight: 5 },
      { word: "systematic", weight: 4 },
      { word: "methodology", weight: 5 },
      { word: "framework", weight: 4 },
      // Chinese
      { word: "技术", weight: 6 },
      { word: "详细", weight: 5 },
      { word: "精确", weight: 6 },
      { word: "实现", weight: 5 },
      { word: "架构", weight: 6 },
    ],
    patterns: [
      { regex: /step[- ]by[- ]step/gi, weight: 6 },
      { regex: /in[- ]depth/gi, weight: 5 },
      { regex: /under the hood/gi, weight: 5 },
      { regex: /```[\s\S]*?```/g, weight: 8 },
    ],
  },
  {
    name: "brevity",
    keywords: [
      { word: "concise", weight: 8 },
      { word: "brief", weight: 7 },
      { word: "short", weight: 5 },
      { word: "succinct", weight: 8 },
      { word: "terse", weight: 7 },
      { word: "minimal", weight: 5 },
      { word: "compact", weight: 5 },
      { word: "straightforward", weight: 4 },
      { word: "direct", weight: 5 },
      { word: "to the point", weight: 7 },
      // Chinese
      { word: "简洁", weight: 8 },
      { word: "简短", weight: 7 },
      { word: "精简", weight: 7 },
      { word: "直接", weight: 5 },
    ],
    patterns: [
      { regex: /keep it (short|brief|concise)/gi, weight: 8 },
      { regex: /no (fluff|filler|unnecessary)/gi, weight: 7 },
      { regex: /get to the point/gi, weight: 8 },
      { regex: /avoid (verbose|lengthy|long)/gi, weight: 6 },
    ],
  },
  {
    name: "sales_focus",
    keywords: [
      { word: "sell", weight: 6 },
      { word: "sales", weight: 7 },
      { word: "convert", weight: 6 },
      { word: "conversion", weight: 7 },
      { word: "upsell", weight: 8 },
      { word: "cross-sell", weight: 8 },
      { word: "revenue", weight: 6 },
      { word: "purchase", weight: 5 },
      { word: "buy", weight: 5 },
      { word: "deal", weight: 4 },
      { word: "offer", weight: 4 },
      { word: "discount", weight: 5 },
      { word: "pricing", weight: 5 },
      { word: "ROI", weight: 6 },
      { word: "value proposition", weight: 8 },
      { word: "benefit", weight: 4 },
      { word: "persuade", weight: 6 },
      { word: "recommend", weight: 4 },
      { word: "upgrade", weight: 5 },
      { word: "premium", weight: 5 },
      // Chinese
      { word: "销售", weight: 7 },
      { word: "转化", weight: 7 },
      { word: "推荐", weight: 5 },
      { word: "优惠", weight: 6 },
      { word: "购买", weight: 5 },
    ],
    patterns: [
      { regex: /call to action/gi, weight: 7 },
      { regex: /limited (time|offer)/gi, weight: 6 },
      { regex: /act now/gi, weight: 5 },
      { regex: /don't miss/gi, weight: 5 },
      { regex: /special (price|deal|offer)/gi, weight: 6 },
    ],
  },
];

// ─── Knowledge domain detection ──────────────────────────────────────────────

const KNOWLEDGE_DOMAINS: Array<{
  domain: string;
  keywords: string[];
}> = [
  {
    domain: "customer_support",
    keywords: [
      "support", "ticket", "issue", "help", "resolve", "complaint",
      "satisfaction", "SLA", "escalate", "troubleshoot",
    ],
  },
  {
    domain: "engineering",
    keywords: [
      "code", "deploy", "API", "git", "CI/CD", "debug", "test",
      "architecture", "microservice", "database", "server",
    ],
  },
  {
    domain: "sales",
    keywords: [
      "lead", "pipeline", "quota", "prospect", "deal", "close",
      "revenue", "CRM", "demo", "proposal", "contract",
    ],
  },
  {
    domain: "marketing",
    keywords: [
      "campaign", "content", "SEO", "brand", "audience", "engagement",
      "funnel", "analytics", "social media", "copywriting",
    ],
  },
  {
    domain: "finance",
    keywords: [
      "budget", "invoice", "accounting", "tax", "compliance",
      "audit", "forecast", "P&L", "expense", "revenue",
    ],
  },
  {
    domain: "hr",
    keywords: [
      "hiring", "onboarding", "employee", "benefits", "payroll",
      "performance review", "PTO", "culture", "recruitment",
    ],
  },
  {
    domain: "legal",
    keywords: [
      "contract", "compliance", "regulation", "policy", "terms",
      "liability", "intellectual property", "NDA", "GDPR",
    ],
  },
  {
    domain: "product",
    keywords: [
      "roadmap", "feature", "sprint", "backlog", "user story",
      "MVP", "iteration", "feedback", "requirement",
    ],
  },
];

// ─── Statistics helpers ──────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Approximate the two-tailed p-value for Student's t-distribution
 * using the regularized incomplete beta function.
 */
function tDistPValue(t: number, df: number): number {
  const x = df / (df + t * t);
  return regularizedBeta(x, df / 2, 0.5);
}

/** Regularized incomplete beta function via continued fraction (Lentz's method) */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    numerator =
      -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return (front * f) / a;
}

/** Lanczos approximation for ln(Gamma(z)) */
function lnGamma(z: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Welch's t-test — does NOT assume equal variance between groups.
 */
function welchTTest(
  a: number[],
  b: number[],
): { t: number; df: number; pValue: number } {
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a);
  const varB = variance(b);
  const nA = a.length;
  const nB = b.length;

  if (nA < 2 || nB < 2) {
    return { t: 0, df: 0, pValue: 1 };
  }

  const seA = varA / nA;
  const seB = varB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) {
    return { t: 0, df: nA + nB - 2, pValue: 1 };
  }

  const tStat = (meanA - meanB) / seDiff;
  const df =
    Math.pow(seA + seB, 2) /
    (Math.pow(seA, 2) / (nA - 1) + Math.pow(seB, 2) / (nB - 1));

  const pValue = tDistPValue(Math.abs(tStat), df);
  return { t: tStat, df, pValue };
}

// ─── Prompt Lab Engine ───────────────────────────────────────────────────────

let instance: PromptLabEngine | null = null;

export class PromptLabEngine extends EventEmitter {
  /** botId -> version number -> PromptVersion */
  private versions = new Map<string, Map<number, PromptVersion>>();
  /** botId -> latest version number */
  private latestVersions = new Map<string, number>();
  /** testId -> PromptABTest */
  private abTests = new Map<string, PromptABTest>();
  /** testId -> control CQI samples */
  private abTestControlSamples = new Map<string, number[]>();
  /** testId -> treatment CQI samples */
  private abTestTreatmentSamples = new Map<string, number[]>();

  constructor() {
    super();
  }

  // ─── Version Management ─────────────────────────────────────────────────

  /**
   * Create a new version of a bot's prompt.
   * Auto-increments version number. Computes genome on creation.
   */
  createVersion(params: {
    botId: string;
    createdBy: string;
    content: { identityMd: string; soulMd?: string };
    tags?: string[];
    changeDescription: string;
  }): PromptVersion {
    const { botId, createdBy, content, tags, changeDescription } = params;

    const currentLatest = this.latestVersions.get(botId) ?? 0;
    const nextVersion = currentLatest + 1;

    const id = `pv_${botId}_${nextVersion}_${Date.now().toString(36)}`;

    const genome = this.analyzeGenome(content.identityMd, content.soulMd);

    const version: PromptVersion = {
      id,
      botId,
      version: nextVersion,
      createdAt: new Date(),
      createdBy,
      content,
      tags: tags ?? [],
      changeDescription,
      genome,
    };

    if (!this.versions.has(botId)) {
      this.versions.set(botId, new Map());
    }
    this.versions.get(botId)!.set(nextVersion, version);
    this.latestVersions.set(botId, nextVersion);

    this.emit("versionCreated", { botId, version: nextVersion, id });
    logger.info(
      { botId, version: nextVersion, id },
      "[PromptLab] Version created",
    );

    return version;
  }

  /** Get a specific version of a bot's prompt. */
  getVersion(botId: string, version: number): PromptVersion {
    const botVersions = this.versions.get(botId);
    if (!botVersions) throw new Error(`No versions found for bot: ${botId}`);
    const v = botVersions.get(version);
    if (!v) throw new Error(`Version ${version} not found for bot: ${botId}`);
    return v;
  }

  /** Get the latest version of a bot's prompt. */
  getLatestVersion(botId: string): PromptVersion {
    const latest = this.latestVersions.get(botId);
    if (latest === undefined) throw new Error(`No versions found for bot: ${botId}`);
    return this.getVersion(botId, latest);
  }

  /** List all versions for a bot, optionally filtered by tags. */
  listVersions(botId: string, filterTags?: string[]): PromptVersion[] {
    const botVersions = this.versions.get(botId);
    if (!botVersions) return [];

    let result = Array.from(botVersions.values()).sort(
      (a, b) => b.version - a.version,
    );

    if (filterTags && filterTags.length > 0) {
      result = result.filter((v) =>
        filterTags.some((tag) => v.tags.includes(tag)),
      );
    }

    return result;
  }

  /** Tag a specific version. */
  tagVersion(botId: string, version: number, tag: string): PromptVersion {
    const v = this.getVersion(botId, version);
    if (!v.tags.includes(tag)) {
      v.tags.push(tag);
    }
    logger.info({ botId, version, tag }, "[PromptLab] Version tagged");
    return v;
  }

  /** Update metrics for a version (typically called from quality pipeline). */
  updateVersionMetrics(
    botId: string,
    version: number,
    metrics: { sessionCount: number; avgCqi: number; avgSentiment: number },
  ): void {
    const v = this.getVersion(botId, version);
    v.metrics = metrics;
    logger.debug(
      { botId, version, avgCqi: metrics.avgCqi },
      "[PromptLab] Version metrics updated",
    );
  }

  /** List all bots that have at least one version. */
  listBots(): string[] {
    return Array.from(this.versions.keys());
  }

  // ─── Diff Calculator ───────────────────────────────────────────────────

  /**
   * Compute a line-based diff between two versions of a bot's prompt.
   * Uses a simple LCS-based diff algorithm.
   */
  diffVersions(botId: string, fromVersion: number, toVersion: number): PromptDiff {
    const from = this.getVersion(botId, fromVersion);
    const to = this.getVersion(botId, toVersion);

    const fromText = this.combineContent(from.content);
    const toText = this.combineContent(to.content);

    const fromLines = fromText.split("\n");
    const toLines = toText.split("\n");

    const diffLines = this.computeLineDiff(fromLines, toLines);

    const stats = {
      added: diffLines.filter((l) => l.type === "added").length,
      removed: diffLines.filter((l) => l.type === "removed").length,
      unchanged: diffLines.filter((l) => l.type === "unchanged").length,
    };

    return {
      fromVersion,
      toVersion,
      botId,
      lines: diffLines,
      stats,
    };
  }

  /** Combine IDENTITY.md and SOUL.md content for diffing. */
  private combineContent(content: { identityMd: string; soulMd?: string }): string {
    let result = `# IDENTITY.md\n${content.identityMd}`;
    if (content.soulMd) {
      result += `\n\n# SOUL.md\n${content.soulMd}`;
    }
    return result;
  }

  /**
   * Simple LCS-based line diff.
   * Produces a sequence of added, removed, and unchanged lines.
   */
  private computeLineDiff(
    oldLines: string[],
    newLines: string[],
  ): DiffLine[] {
    const m = oldLines.length;
    const n = newLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0),
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to build diff
    const result: DiffLine[] = [];
    let i = m;
    let j = n;
    const stack: DiffLine[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        stack.push({
          type: "unchanged",
          lineNumber: j,
          content: newLines[j - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        stack.push({
          type: "added",
          lineNumber: j,
          content: newLines[j - 1],
        });
        j--;
      } else {
        stack.push({
          type: "removed",
          lineNumber: i,
          content: oldLines[i - 1],
        });
        i--;
      }
    }

    // Reverse since we built it backward
    while (stack.length > 0) {
      result.push(stack.pop()!);
    }

    return result;
  }

  // ─── Genome Analyzer ───────────────────────────────────────────────────

  /**
   * Analyze a prompt and extract a genome: behavioural traits, knowledge
   * domains, and language profile.
   */
  analyzeGenome(identityMd: string, soulMd?: string): PromptGenome {
    const fullText = soulMd ? `${identityMd}\n${soulMd}` : identityMd;
    const lowerText = fullText.toLowerCase();

    // --- Trait scoring ---
    const traits = TRAIT_DICTIONARIES.map((dict) => {
      let rawScore = 0;
      const evidence: string[] = [];

      // Keyword matching
      for (const kw of dict.keywords) {
        const kwLower = kw.word.toLowerCase();
        let count = 0;
        let searchFrom = 0;
        while (true) {
          const idx = lowerText.indexOf(kwLower, searchFrom);
          if (idx === -1) break;
          count++;
          searchFrom = idx + kwLower.length;
        }
        if (count > 0) {
          rawScore += kw.weight * Math.min(count, 5); // cap at 5 occurrences
          evidence.push(`"${kw.word}" x${count}`);
        }
      }

      // Pattern matching
      for (const pat of dict.patterns) {
        // Reset lastIndex for global patterns
        pat.regex.lastIndex = 0;
        const matches = fullText.match(pat.regex);
        if (matches && matches.length > 0) {
          rawScore += pat.weight * Math.min(matches.length, 3);
          evidence.push(`pattern /${pat.regex.source}/ x${matches.length}`);
        }
      }

      // Normalize to 0-100 (sigmoid-like curve so it saturates)
      const score = Math.min(100, Math.round((100 * rawScore) / (rawScore + 40)));

      return { name: dict.name, score, evidence };
    });

    // --- Knowledge domain detection ---
    const knowledgeDomains = KNOWLEDGE_DOMAINS.map((domainDef) => {
      let matchCount = 0;
      for (const kw of domainDef.keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
          matchCount++;
        }
      }
      const coverage = Math.min(
        100,
        Math.round((matchCount / domainDef.keywords.length) * 100),
      );
      return { domain: domainDef.domain, coverage };
    }).filter((d) => d.coverage > 0);

    // --- Language profile ---
    const primaryLanguage = this.detectPrimaryLanguage(fullText);

    // Formality: reuse trait score
    const formalityTrait = traits.find((t) => t.name === "formality");
    const formality = formalityTrait?.score ?? 0;

    // Emotional expressiveness: based on empathy + exclamation marks + emotional words
    const empathyTrait = traits.find((t) => t.name === "empathy");
    const exclamationCount = (fullText.match(/!/g) || []).length;
    const emotionWords = (fullText.match(
      /\b(love|hate|amazing|wonderful|terrible|great|awesome|fantastic|horrible|excited|happy|sad|angry|frustrated)\b/gi,
    ) || []).length;
    const emotionalRaw =
      (empathyTrait?.score ?? 0) * 0.5 +
      Math.min(30, exclamationCount * 5) +
      Math.min(30, emotionWords * 6);
    const emotionalExpressiveness = Math.min(100, Math.round(emotionalRaw));

    return {
      traits,
      knowledgeDomains,
      languageProfile: {
        primaryLanguage,
        formality,
        emotionalExpressiveness,
      },
    };
  }

  /** Simple heuristic language detection (Chinese vs English). */
  private detectPrimaryLanguage(text: string): string {
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const totalChars = text.replace(/\s/g, "").length;
    if (totalChars === 0) return "unknown";

    const cjkRatio = cjkChars / totalChars;
    if (cjkRatio > 0.3) return "zh";
    return "en";
  }

  // ─── A/B Test Orchestrator ─────────────────────────────────────────────

  /**
   * Create an A/B test between two prompt versions.
   * Traffic split determines what fraction goes to the treatment version.
   */
  createABTest(params: {
    botId: string;
    controlVersion: number;
    treatmentVersion: number;
    trafficSplit?: number;
    minSessions?: number;
    successMetric?: string;
  }): PromptABTest {
    const {
      botId,
      controlVersion,
      treatmentVersion,
      trafficSplit = 0.5,
      minSessions = 100,
      successMetric = "avgCqi",
    } = params;

    // Validate versions exist
    this.getVersion(botId, controlVersion);
    this.getVersion(botId, treatmentVersion);

    if (trafficSplit < 0 || trafficSplit > 1) {
      throw new Error("trafficSplit must be between 0 and 1");
    }

    const id = `abtest_${botId}_${Date.now().toString(36)}`;
    const now = new Date();

    const test: PromptABTest = {
      id,
      botId,
      status: "running",
      config: {
        controlVersion,
        treatmentVersion,
        trafficSplit,
        minSessions,
        successMetric,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.abTests.set(id, test);
    this.abTestControlSamples.set(id, []);
    this.abTestTreatmentSamples.set(id, []);

    this.emit("abTestCreated", { testId: id, botId });
    logger.info(
      { testId: id, botId, controlVersion, treatmentVersion, trafficSplit },
      "[PromptLab] A/B test created",
    );

    return test;
  }

  /**
   * Route a session to either control or treatment.
   * Returns the version number that should be used.
   */
  routeSession(testId: string): { version: number; group: "control" | "treatment" } {
    const test = this.getABTest(testId);
    if (test.status !== "running") {
      throw new Error(`A/B test ${testId} is not running (status: ${test.status})`);
    }

    const rand = Math.random();
    if (rand < test.config.trafficSplit) {
      return { version: test.config.treatmentVersion, group: "treatment" };
    }
    return { version: test.config.controlVersion, group: "control" };
  }

  /**
   * Record a CQI metric observation for a running A/B test.
   */
  recordMetric(
    testId: string,
    group: "control" | "treatment",
    cqiValue: number,
  ): void {
    const test = this.getABTest(testId);
    if (test.status !== "running") {
      logger.warn(
        { testId, status: test.status },
        "[PromptLab] Ignoring metric for non-running test",
      );
      return;
    }

    if (group === "control") {
      this.abTestControlSamples.get(testId)!.push(cqiValue);
    } else {
      this.abTestTreatmentSamples.get(testId)!.push(cqiValue);
    }

    // Check if we've reached minSessions and can auto-evaluate
    const controlSamples = this.abTestControlSamples.get(testId)!;
    const treatmentSamples = this.abTestTreatmentSamples.get(testId)!;
    const totalSessions = controlSamples.length + treatmentSamples.length;

    if (totalSessions >= test.config.minSessions) {
      this.evaluateABTest(testId);
    }
  }

  /**
   * Evaluate an A/B test: compute statistics and determine a winner.
   */
  evaluateABTest(testId: string): PromptABTest {
    const test = this.getABTest(testId);
    const controlSamples = this.abTestControlSamples.get(testId) ?? [];
    const treatmentSamples = this.abTestTreatmentSamples.get(testId) ?? [];

    const controlAvg = mean(controlSamples);
    const treatmentAvg = mean(treatmentSamples);

    // Welch's t-test
    const { pValue } = welchTTest(treatmentSamples, controlSamples);

    const lift =
      controlAvg !== 0 ? ((treatmentAvg - controlAvg) / controlAvg) * 100 : 0;

    let recommendation: string;
    if (pValue > 0.05) {
      recommendation =
        `Inconclusive (p=${pValue.toFixed(3)}). ` +
        `Need more data — ${controlSamples.length + treatmentSamples.length} sessions collected so far.`;
    } else if (treatmentAvg > controlAvg) {
      recommendation =
        `Treatment wins with +${lift.toFixed(1)}% lift (p=${pValue.toFixed(3)}). ` +
        `Recommend promoting version ${test.config.treatmentVersion} to production.`;
    } else {
      recommendation =
        `Control wins. Treatment showed ${lift.toFixed(1)}% change (p=${pValue.toFixed(3)}). ` +
        `Recommend keeping version ${test.config.controlVersion}.`;
    }

    test.results = {
      controlMetrics: { sessions: controlSamples.length, avgCqi: controlAvg },
      treatmentMetrics: { sessions: treatmentSamples.length, avgCqi: treatmentAvg },
      pValue,
      lift,
      recommendation,
    };

    if (pValue <= 0.05) {
      test.status = "completed";
      test.updatedAt = new Date();
      this.emit("abTestCompleted", { testId, results: test.results });
      logger.info(
        { testId, lift: lift.toFixed(1), pValue: pValue.toFixed(3) },
        "[PromptLab] A/B test completed",
      );
    }

    return test;
  }

  /** Cancel a running A/B test. */
  cancelABTest(testId: string): PromptABTest {
    const test = this.getABTest(testId);
    if (test.status !== "running") {
      throw new Error(`Cannot cancel test in status "${test.status}"`);
    }
    test.status = "cancelled";
    test.updatedAt = new Date();

    this.emit("abTestCancelled", { testId });
    logger.info({ testId }, "[PromptLab] A/B test cancelled");
    return test;
  }

  /** Get a specific A/B test. */
  getABTest(testId: string): PromptABTest {
    const test = this.abTests.get(testId);
    if (!test) throw new Error(`A/B test not found: ${testId}`);
    return test;
  }

  /** List A/B tests, optionally filtered by botId or status. */
  listABTests(filter?: {
    botId?: string;
    status?: PromptABTest["status"];
  }): PromptABTest[] {
    let result = Array.from(this.abTests.values());
    if (filter?.botId) result = result.filter((t) => t.botId === filter.botId);
    if (filter?.status) result = result.filter((t) => t.status === filter.status);
    return result;
  }

  // ─── Cross-Pollination Engine ──────────────────────────────────────────

  /**
   * Analyze genomes of multiple bots and suggest trait transfers.
   * For each trait, if one bot scores significantly higher than another,
   * suggest that the weaker bot learn from the stronger one.
   */
  suggestCrossPollination(
    botIds: string[],
    minGap: number = 25,
  ): CrossPollinationSuggestion[] {
    const suggestions: CrossPollinationSuggestion[] = [];

    // Gather genomes
    const genomes = new Map<string, PromptGenome>();
    for (const botId of botIds) {
      try {
        const latest = this.getLatestVersion(botId);
        if (latest.genome) {
          genomes.set(botId, latest.genome);
        }
      } catch {
        // Bot has no versions, skip
        logger.debug({ botId }, "[PromptLab] Skipping bot with no versions for cross-pollination");
      }
    }

    if (genomes.size < 2) return suggestions;

    const botGenomeEntries = Array.from(genomes.entries());

    // Compare each pair
    for (let i = 0; i < botGenomeEntries.length; i++) {
      for (let j = i + 1; j < botGenomeEntries.length; j++) {
        const [botA, genomeA] = botGenomeEntries[i];
        const [botB, genomeB] = botGenomeEntries[j];

        for (const traitA of genomeA.traits) {
          const traitB = genomeB.traits.find((t) => t.name === traitA.name);
          if (!traitB) continue;

          const gap = traitA.score - traitB.score;

          if (gap >= minGap) {
            suggestions.push({
              sourceBotId: botA,
              targetBotId: botB,
              trait: traitA.name,
              sourceScore: traitA.score,
              targetScore: traitB.score,
              gap,
              suggestion: this.generatePollinationAdvice(
                traitA.name,
                botA,
                botB,
                traitA.score,
                traitB.score,
                traitA.evidence,
              ),
            });
          } else if (-gap >= minGap) {
            suggestions.push({
              sourceBotId: botB,
              targetBotId: botA,
              trait: traitA.name,
              sourceScore: traitB.score,
              targetScore: traitA.score,
              gap: -gap,
              suggestion: this.generatePollinationAdvice(
                traitA.name,
                botB,
                botA,
                traitB.score,
                traitA.score,
                traitB.evidence,
              ),
            });
          }
        }
      }
    }

    // Sort by gap descending — biggest improvement opportunities first
    suggestions.sort((a, b) => b.gap - a.gap);

    logger.info(
      { botCount: botIds.length, suggestionCount: suggestions.length },
      "[PromptLab] Cross-pollination analysis complete",
    );

    return suggestions;
  }

  private generatePollinationAdvice(
    trait: string,
    sourceBotId: string,
    targetBotId: string,
    sourceScore: number,
    targetScore: number,
    evidence: string[],
  ): string {
    const traitLabels: Record<string, string> = {
      empathy: "empathetic communication",
      formality: "formal/professional tone",
      technical_depth: "technical depth and precision",
      brevity: "concise and direct responses",
      sales_focus: "sales-oriented messaging",
    };

    const label = traitLabels[trait] ?? trait;
    const evidenceStr =
      evidence.length > 0
        ? ` Key patterns: ${evidence.slice(0, 3).join(", ")}.`
        : "";

    return (
      `Bot "${targetBotId}" (score: ${targetScore}) could improve ${label} ` +
      `by adopting patterns from "${sourceBotId}" (score: ${sourceScore}).${evidenceStr} ` +
      `Consider reviewing ${sourceBotId}'s IDENTITY.md for ${trait}-related phrasing.`
    );
  }

  // ─── Prompt Quality Scorer ─────────────────────────────────────────────

  /**
   * Score a prompt version's quality based on its collected CQI metrics
   * and structural analysis.
   */
  scorePromptQuality(botId: string, version: number): PromptQualityScore {
    const v = this.getVersion(botId, version);
    const recommendations: string[] = [];

    // --- Clarity: based on structure, headers, bullet points ---
    const fullText = this.combineContent(v.content);
    const lines = fullText.split("\n");
    const headerCount = lines.filter((l) => /^#{1,3}\s/.test(l)).length;
    const bulletCount = lines.filter((l) => /^\s*[-*]\s/.test(l)).length;
    const avgLineLength =
      lines.length > 0
        ? lines.reduce((sum, l) => sum + l.length, 0) / lines.length
        : 0;

    let clarity = 50; // baseline
    if (headerCount >= 3) clarity += 15;
    else if (headerCount >= 1) clarity += 8;
    else recommendations.push("Add section headers for better structure.");

    if (bulletCount >= 3) clarity += 15;
    else if (bulletCount >= 1) clarity += 8;
    else recommendations.push("Use bullet points to organize instructions.");

    if (avgLineLength < 120) clarity += 10;
    else recommendations.push("Consider shorter lines for readability.");

    if (fullText.length > 100) clarity += 10;
    else recommendations.push("Prompt seems very short — consider adding more detail.");

    clarity = Math.min(100, clarity);

    // --- Completeness: does it cover key prompt sections? ---
    let completeness = 0;
    const completenessChecks = [
      { pattern: /role|identity|you are/i, label: "Role definition", weight: 20 },
      { pattern: /tone|voice|style/i, label: "Tone/voice guidance", weight: 15 },
      { pattern: /do not|never|avoid|don't/i, label: "Negative constraints", weight: 15 },
      { pattern: /example|e\.g\.|for instance/i, label: "Examples", weight: 15 },
      { pattern: /goal|objective|purpose/i, label: "Goal/purpose", weight: 15 },
      { pattern: /knowledge|domain|expertise|speciali/i, label: "Knowledge scope", weight: 10 },
      { pattern: /format|structure|output/i, label: "Output format guidance", weight: 10 },
    ];

    for (const check of completenessChecks) {
      if (check.pattern.test(fullText)) {
        completeness += check.weight;
      } else {
        recommendations.push(`Consider adding ${check.label.toLowerCase()}.`);
      }
    }
    completeness = Math.min(100, completeness);

    // --- Consistency: low internal contradiction signals ---
    let consistency = 80; // default high, penalize for contradictions
    const contradictionPairs = [
      [/\bformal\b/i, /\bcasual\b/i],
      [/\bverbose\b/i, /\bconcise\b/i],
      [/\bfriendly\b/i, /\bstrict\b/i],
      [/\bdetailed\b/i, /\bbrief\b/i],
    ];

    for (const [patA, patB] of contradictionPairs) {
      if (patA.test(fullText) && patB.test(fullText)) {
        consistency -= 15;
        recommendations.push(
          `Potential contradiction: prompt mentions both "${patA.source}" and "${patB.source}".`,
        );
      }
    }
    consistency = Math.max(0, Math.min(100, consistency));

    // --- Effectiveness: based on collected CQI metrics ---
    let effectiveness = 50; // baseline if no metrics
    if (v.metrics) {
      // CQI is typically 0-100
      effectiveness = Math.min(100, Math.round(v.metrics.avgCqi));
      if (v.metrics.avgSentiment < 0.3) {
        recommendations.push(
          "Low average sentiment detected. Consider adjusting tone.",
        );
      }
      if (v.metrics.sessionCount < 10) {
        recommendations.push(
          "Limited data — quality score will improve with more sessions.",
        );
      }
    } else {
      recommendations.push(
        "No CQI metrics collected yet. Score is based on structural analysis only.",
      );
    }

    const overall = Math.round(
      clarity * 0.25 +
      completeness * 0.25 +
      consistency * 0.2 +
      effectiveness * 0.3,
    );

    const score: PromptQualityScore = {
      botId,
      version,
      overall,
      breakdown: { clarity, completeness, consistency, effectiveness },
      recommendations,
      scoredAt: new Date(),
    };

    logger.info(
      { botId, version, overall, clarity, completeness, consistency, effectiveness },
      "[PromptLab] Prompt quality scored",
    );

    return score;
  }

  // ─── Fleet-wide Summary ────────────────────────────────────────────────

  /** Get a summary of the prompt lab state across all bots. */
  getSummary(): {
    totalBots: number;
    totalVersions: number;
    activeABTests: number;
    completedABTests: number;
    avgTraitScores: Record<string, number>;
  } {
    let totalVersions = 0;
    const traitSums: Record<string, number> = {};
    const traitCounts: Record<string, number> = {};

    for (const botVersions of this.versions.values()) {
      totalVersions += botVersions.size;

      // Use latest version for trait averages
      const sorted = Array.from(botVersions.values()).sort(
        (a, b) => b.version - a.version,
      );
      const latest = sorted[0];
      if (latest?.genome) {
        for (const trait of latest.genome.traits) {
          traitSums[trait.name] = (traitSums[trait.name] ?? 0) + trait.score;
          traitCounts[trait.name] = (traitCounts[trait.name] ?? 0) + 1;
        }
      }
    }

    const avgTraitScores: Record<string, number> = {};
    for (const [name, sum] of Object.entries(traitSums)) {
      avgTraitScores[name] = Math.round(sum / (traitCounts[name] || 1));
    }

    const allTests = Array.from(this.abTests.values());

    return {
      totalBots: this.versions.size,
      totalVersions,
      activeABTests: allTests.filter((t) => t.status === "running").length,
      completedABTests: allTests.filter((t) => t.status === "completed").length,
      avgTraitScores,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export function getPromptLabEngine(): PromptLabEngine {
  if (!instance) {
    instance = new PromptLabEngine();
  }
  return instance;
}

export function disposePromptLabEngine(): void {
  if (instance) {
    instance.removeAllListeners();
    instance = null;
  }
}

export default PromptLabEngine;
