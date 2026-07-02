/**
 * Fleet Memory Mesh Engine
 *
 * Federates memory search across all bots' SQLite vector databases.
 * OpenClaw stores bot memory in ~/.openclaw/memory/<agentId>.sqlite with
 * sqlite-vec for vector embeddings, enabling semantic search.
 *
 * Key capabilities:
 * - Federated search (query all bots' memory DBs in parallel)
 * - Cross-bot synthesis (AI-generated summary across bot memories)
 * - Memory conflict detection (same topic, different facts)
 * - Knowledge graph construction (topic → bot mapping)
 * - Memory health analysis (age, staleness, coverage, gaps)
 * - Gap detection (topics only one bot knows about)
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  content: string;
  similarity: number; // 0-1 vector similarity
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  source: "conversation" | "manual" | "skill" | "system";
  relatedSessionKey?: string;
  tags?: string[];
}

/**
 * Raw memory record returned by a bot's memory reader. The mesh engine maps
 * these into {@link MemoryEntry}s (filling defaults for similarity/access).
 * Decoupled from the gateway RPC so the engine stays unit-testable.
 */
export interface RawBotMemory {
  content: string;
  tags?: string[];
  source?: MemoryEntry["source"];
  createdAt?: Date;
  lastAccessed?: Date;
  accessCount?: number;
}

export interface BotMemoryResult {
  botId: string;
  botName: string;
  memories: MemoryEntry[];
  searchTimeMs: number;
}

export interface FederatedSearchResult {
  query: string;
  totalResults: number;
  results: BotMemoryResult[];
  synthesis?: string; // AI-generated cross-bot summary
  searchTimeMs: number;
}

export interface FederatedSearchOptions {
  botIds?: string[];
  topK?: number; // results per bot
  minSimilarity?: number;
  includeMetadata?: boolean;
  synthesize?: boolean; // generate cross-bot summary
  /** Restrict the search to a single tenant's bots (multi-tenant isolation). */
  companyId?: string;
}

export interface MemoryConflict {
  id: string;
  /** Owning tenant — conflicts never span companies (set at detection time). */
  companyId?: string;
  topic: string;
  conflictingMemories: Array<{
    botId: string;
    botName: string;
    content: string;
    createdAt: Date;
    confidence: number;
  }>;
  suggestedResolution: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved" | "dismissed";
  resolvedAt?: Date;
}

export interface KnowledgeGraphNode {
  id: string;
  /** Owning tenant — graph nodes never span companies (set at build time). */
  companyId?: string;
  topic: string;
  memoryCount: number;
  bots: string[];
  freshness: number; // 0-1
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  weight: number;
  sharedBots: string[];
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface BotMemoryStats {
  botId: string;
  botName: string;
  totalMemories: number;
  avgAgeDays: number;
  staleCount: number; // > 30 days without access
  conflictCount: number;
  coverageTopics: string[];
  gaps: string[]; // topics other bots have but this one doesn't
}

export interface FleetMemoryHealth {
  perBot: BotMemoryStats[];
  fleet: {
    totalMemories: number;
    uniqueTopics: number;
    crossBotOverlap: number; // 0-1
    conflictRate: number;
    knowledgeDistribution: "balanced" | "concentrated" | "fragmented";
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class MemoryMeshEngine extends EventEmitter {
  private botMemories: Map<string, MemoryEntry[]> = new Map(); // botId → memories
  private botNames: Map<string, string> = new Map(); // botId → name
  private botCompanies: Map<string, string> = new Map(); // botId → companyId (tenant isolation)
  private conflicts: Map<string, MemoryConflict> = new Map();
  private knowledgeGraph: KnowledgeGraph = { nodes: [], edges: [] };
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  // Rate limiting: max 10 federated searches per minute
  private searchCount = 0;
  private searchCountResetTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxSearchesPerMinute = 10;

  constructor(
    private botProvider: {
      getBots(): Array<{ id: string; name: string; gatewayUrl: string; companyId?: string }>;
      /**
       * Read a bot's curated memory files (via gateway RPC in production).
       * Optional so the engine can be constructed with a bare bot list in
       * tests; when absent, scans preserve any pre-seeded memories.
       */
      readBotMemories?(botId: string): Promise<RawBotMemory[]>;
    },
  ) {
    super();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    // Periodic memory scan (every 15 minutes)
    this.scanTimer = setInterval(() => this.scanAllBotMemories(), 15 * 60 * 1000);

    // Rate limit reset
    this.searchCountResetTimer = setInterval(() => {
      this.searchCount = 0;
    }, 60_000);

    // Initial scan
    this.scanAllBotMemories();
    this.emit("started");
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.searchCountResetTimer) {
      clearInterval(this.searchCountResetTimer);
      this.searchCountResetTimer = null;
    }
    this.emit("stopped");
  }

  // ── Memory Scanning ─────────────────────────────────────────────────────

  private async scanAllBotMemories(): Promise<void> {
    const bots = this.botProvider.getBots();

    for (const bot of bots) {
      this.botNames.set(bot.id, bot.name);
      if (bot.companyId) this.botCompanies.set(bot.id, bot.companyId);
      try {
        await this.scanBotMemory(bot.id, bot.gatewayUrl);
      } catch (err) {
        this.emit("scan_error", { botId: bot.id, error: err });
      }
    }

    // Rebuild knowledge graph after scan
    this.buildKnowledgeGraph();

    // Detect conflicts
    this.detectConflicts();

    this.emit("scan_complete", {
      botsScanned: bots.length,
      totalMemories: this.getTotalMemoryCount(),
    });
  }

  private async scanBotMemory(botId: string, _gatewayUrl: string): Promise<void> {
    // Read the bot's curated memory files through the injected reader, which
    // in production pulls them over the OpenClaw gateway RPC
    // (agents.files.list "memory/" + agents.files.get, frontmatter-parsed).
    if (!this.botProvider.readBotMemories) {
      // No reader wired (e.g. unit tests with a bare bot list) — preserve any
      // memories that were seeded directly so the engine still functions.
      const existingMemories = this.botMemories.get(botId) ?? [];
      this.botMemories.set(botId, existingMemories);
      return;
    }

    const raw = await this.botProvider.readBotMemories(botId);
    const now = new Date();
    const entries: MemoryEntry[] = raw.map((m) => ({
      content: m.content,
      similarity: 0, // populated per-query by federatedSearch
      createdAt: m.createdAt ?? now,
      lastAccessed: m.lastAccessed ?? m.createdAt ?? now,
      accessCount: m.accessCount ?? 1,
      source: m.source ?? "manual",
      tags: m.tags,
    }));

    this.botMemories.set(botId, entries);
  }

  // ── Federated Search ─────────────────────────────────────────────────────

  async federatedSearch(
    query: string,
    options?: FederatedSearchOptions,
  ): Promise<FederatedSearchResult> {
    // Rate limiting
    if (this.searchCount >= this.maxSearchesPerMinute) {
      throw new Error(
        `Rate limit exceeded: max ${this.maxSearchesPerMinute} federated searches per minute`,
      );
    }
    this.searchCount++;

    const startTime = Date.now();
    const topK = options?.topK ?? 5;
    const minSimilarity = options?.minSimilarity ?? 0.3;

    // Tenant isolation: restrict the search to the requesting company's bots so
    // a federated search never reads (or synthesizes over) another tenant's
    // private memory content. Explicit botIds are also clamped to the company.
    let targetBotIds = options?.botIds ?? Array.from(this.botMemories.keys());
    if (options?.companyId) {
      targetBotIds = targetBotIds.filter(
        (botId) => this.botCompanies.get(botId) === options.companyId,
      );
    }
    const results: BotMemoryResult[] = [];

    // Search each bot's memories in parallel
    const searchPromises = targetBotIds.map(async (botId) => {
      const botStart = Date.now();
      const memories = this.botMemories.get(botId) ?? [];
      const botName = this.botNames.get(botId) ?? botId;

      // Simple content-based search (in production, use vector similarity)
      const queryLower = query.toLowerCase();
      const matched = memories
        .map((m) => ({
          ...m,
          similarity: this.calculateTextSimilarity(queryLower, m.content.toLowerCase()),
        }))
        .filter((m) => m.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      return {
        botId,
        botName,
        memories: matched,
        searchTimeMs: Date.now() - botStart,
      };
    });

    const botResults = await Promise.all(searchPromises);
    results.push(...botResults.filter((r) => r.memories.length > 0));

    const totalResults = results.reduce((sum, r) => sum + r.memories.length, 0);

    const result: FederatedSearchResult = {
      query,
      totalResults,
      results,
      searchTimeMs: Date.now() - startTime,
    };

    // Synthesize cross-bot summary if requested
    if (options?.synthesize && totalResults > 0) {
      result.synthesis = this.synthesizeResults(query, results);
    }

    this.emit("federated_search", { query, totalResults, searchTimeMs: result.searchTimeMs });
    return result;
  }

  private calculateTextSimilarity(query: string, content: string): number {
    // Simple keyword-based similarity (in production, use vector similarity from sqlite-vec)
    const queryWords = query.split(/\s+/).filter((w) => w.length > 1);
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (content.includes(word)) matches++;
    }

    return matches / queryWords.length;
  }

  private synthesizeResults(query: string, results: BotMemoryResult[]): string {
    // In production, this would call Claude API for synthesis
    // For now, generate a simple summary
    const botSummaries = results.map(
      (r) =>
        `${r.botName}: ${r.memories.length} relevant memories (top similarity: ${r.memories[0]?.similarity.toFixed(2) ?? "N/A"})`,
    );

    return `Cross-bot search for "${query}" found ${results.reduce((s, r) => s + r.memories.length, 0)} results across ${results.length} bots:\n${botSummaries.join("\n")}`;
  }

  // ── Conflict Detection ───────────────────────────────────────────────────

  private detectConflicts(): void {
    // Group memories by (company, topic). Keying the group on the owning tenant
    // ensures a conflict never spans companies — otherwise the same topic word
    // appearing in two unrelated tenants' memories would fabricate a bogus
    // cross-tenant conflict AND leak the other tenant's memory content.
    const topicMemories = new Map<
      string,
      { companyId?: string; topic: string; entries: Array<{ botId: string; botName: string; memory: MemoryEntry }> }
    >();

    for (const [botId, memories] of this.botMemories) {
      const botName = this.botNames.get(botId) ?? botId;
      const companyId = this.botCompanies.get(botId);
      for (const memory of memories) {
        // Extract topic from memory content (simplified)
        const topics = this.extractTopics(memory.content);
        for (const topic of topics) {
          const key = `${companyId ?? "__none__"}::${topic}`;
          const existing = topicMemories.get(key) ?? { companyId, topic, entries: [] };
          existing.entries.push({ botId, botName, memory });
          topicMemories.set(key, existing);
        }
      }
    }

    // Find topics with conflicting information across bots
    for (const [, group] of topicMemories) {
      const { companyId, topic, entries } = group;
      // Only check topics with entries from multiple bots
      const uniqueBots = new Set(entries.map((e) => e.botId));
      if (uniqueBots.size < 2) continue;

      // Check for content divergence (simplified)
      const contents = entries.map((e) => e.memory.content.toLowerCase());
      const hasConflict = this.detectContentConflict(contents);

      if (hasConflict) {
        const conflictId = `conflict_${topic.replace(/\s+/g, "_")}_${Date.now()}`;

        // Don't create duplicate conflicts (within the same tenant + topic)
        const existingConflict = Array.from(this.conflicts.values()).find(
          (c) => c.topic === topic && c.companyId === companyId && c.status === "open",
        );
        if (existingConflict) continue;

        // Confidence = how likely each memory is the *current* truth, derived
        // deterministically from recency (the newest contradicting memory wins)
        // with a small access-count boost — NOT Math.random (which re-rolled a
        // fabricated confidence on every scan). When timestamps are uniform
        // (nothing to rank), this degrades to an honest equal 0.6 rather than
        // jittering; when the memory feed carries real dates/access counts it
        // ranks the conflicting memories meaningfully.
        const times = entries.map((e) => e.memory.createdAt.getTime());
        const oldestTime = Math.min(...times);
        const timeSpan = Math.max(...times) - oldestTime || 1;
        const maxAccess = Math.max(1, ...entries.map((e) => e.memory.accessCount));

        const conflict: MemoryConflict = {
          id: conflictId,
          companyId,
          topic,
          conflictingMemories: entries.map((e) => {
            const recency = (e.memory.createdAt.getTime() - oldestTime) / timeSpan; // 0..1
            const usage = e.memory.accessCount / maxAccess; // 0..1
            const score = 0.6 + 0.3 * recency + 0.1 * usage; // 0.6..1.0
            return {
              botId: e.botId,
              botName: e.botName,
              content: e.memory.content,
              createdAt: e.memory.createdAt,
              confidence: Math.round(score * 100) / 100,
            };
          }),
          suggestedResolution: this.suggestResolution(entries),
          severity: uniqueBots.size > 2 ? "high" : "medium",
          status: "open",
        };

        this.conflicts.set(conflictId, conflict);
        this.emit("conflict_detected", conflict);
      }
    }
  }

  private extractTopics(content: string): string[] {
    // Simplified topic extraction (in production, use NER or embedding clustering)
    const words = content
      .replace(/[^a-zA-Z\u4e00-\u9fff\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Return unique bigrams as "topics"
    const topics: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      topics.push(`${words[i]} ${words[i + 1]}`);
    }
    return topics.slice(0, 5); // Max 5 topics per memory
  }

  private detectContentConflict(contents: string[]): boolean {
    // Simplified: check for numerical disagreements
    const numbers = contents.map((c) => {
      const nums = c.match(/\d+/g);
      return nums ? nums.map(Number) : [];
    });

    // If different entries mention different numbers for the same topic
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        if (
          numbers[i].length > 0 &&
          numbers[j].length > 0 &&
          !numbers[i].some((n) => numbers[j].includes(n))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private suggestResolution(
    entries: Array<{ botId: string; botName: string; memory: MemoryEntry }>,
  ): string {
    // Suggest keeping the most recent memory
    const sorted = [...entries].sort(
      (a, b) => b.memory.createdAt.getTime() - a.memory.createdAt.getTime(),
    );
    const newest = sorted[0];
    return `${newest.botName} has the most recent information (${newest.memory.createdAt.toISOString().slice(0, 10)}). Consider adopting their version.`;
  }

  // ── Conflict Management ──────────────────────────────────────────────────

  getConflicts(
    status?: "open" | "resolved" | "dismissed",
    companyId?: string,
  ): MemoryConflict[] {
    let results = Array.from(this.conflicts.values());
    if (status) {
      results = results.filter((c) => c.status === status);
    }
    // Tenant isolation: only return the requesting company's conflicts. Legacy
    // conflicts with no companyId are excluded from a scoped query so they can't
    // leak; unscoped (admin) callers still see everything.
    if (companyId) {
      results = results.filter((c) => c.companyId === companyId);
    }
    return results;
  }

  resolveConflict(conflictId: string, companyId?: string): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== "open") return false;
    // Tenant isolation: a scoped caller may only resolve its own conflict.
    // A legacy conflict with no companyId is treated as unowned and can't be
    // mutated by a scoped caller; an unscoped (admin) caller proceeds.
    if (companyId && conflict.companyId !== companyId) return false;

    conflict.status = "resolved";
    conflict.resolvedAt = new Date();
    this.emit("conflict_resolved", { conflictId });
    return true;
  }

  dismissConflict(conflictId: string, companyId?: string): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.status !== "open") return false;
    if (companyId && conflict.companyId !== companyId) return false;

    conflict.status = "dismissed";
    this.emit("conflict_dismissed", { conflictId });
    return true;
  }

  // ── Knowledge Graph ──────────────────────────────────────────────────────

  private buildKnowledgeGraph(): void {
    // Key topic aggregation on (company, topic) so a node's bots/memoryCount
    // never mix tenants — the graph is partitioned per company, and a bot
    // (which belongs to exactly one company) only ever appears in its own
    // company's nodes, so edges naturally stay within a tenant.
    const topicBots = new Map<
      string,
      { companyId?: string; topic: string; bots: Set<string>; count: number; latestDate: Date }
    >();

    for (const [botId, memories] of this.botMemories) {
      const companyId = this.botCompanies.get(botId);
      for (const memory of memories) {
        const topics = this.extractTopics(memory.content);
        for (const topic of topics) {
          const key = `${companyId ?? "__none__"}::${topic}`;
          const existing = topicBots.get(key) ?? {
            companyId,
            topic,
            bots: new Set<string>(),
            count: 0,
            latestDate: new Date(0),
          };
          existing.bots.add(botId);
          existing.count++;
          if (memory.createdAt > existing.latestDate) {
            existing.latestDate = memory.createdAt;
          }
          topicBots.set(key, existing);
        }
      }
    }

    // Build nodes
    const nodes: KnowledgeGraphNode[] = Array.from(topicBots.entries())
      .filter(([, data]) => data.count >= 2) // Only topics with 2+ mentions
      .map(([, data]) => {
        const daysSinceLatest =
          (Date.now() - data.latestDate.getTime()) / (1000 * 60 * 60 * 24);
        return {
          // Prefix the node id with the tenant so identical topics in different
          // companies don't collide into a single node / spurious cross edge.
          id: `${data.companyId ?? "__none__"}::${data.topic.replace(/\s+/g, "_")}`,
          companyId: data.companyId,
          topic: data.topic,
          memoryCount: data.count,
          bots: Array.from(data.bots),
          freshness: Math.max(0, 1 - daysSinceLatest / 90), // Decays over 90 days
        };
      })
      .slice(0, 100); // Max 100 nodes

    // Build edges (topics that share bots)
    const edges: KnowledgeGraphEdge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sharedBots = nodes[i].bots.filter((b) => nodes[j].bots.includes(b));
        if (sharedBots.length > 0) {
          edges.push({
            source: nodes[i].id,
            target: nodes[j].id,
            weight: sharedBots.length,
            sharedBots,
          });
        }
      }
    }

    this.knowledgeGraph = { nodes, edges };
    this.emit("knowledge_graph_rebuilt", {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });
  }

  getKnowledgeGraph(
    options?: {
      topics?: string[];
      minConnections?: number;
    },
    companyId?: string,
  ): KnowledgeGraph {
    let { nodes, edges } = this.knowledgeGraph;

    // Tenant isolation: only surface the requesting company's nodes/edges so the
    // graph never exposes another tenant's topics or bot ids.
    if (companyId) {
      nodes = nodes.filter((n) => n.companyId === companyId);
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    if (options?.topics) {
      const topicSet = new Set(options.topics.map((t) => t.toLowerCase()));
      nodes = nodes.filter((n) => topicSet.has(n.topic.toLowerCase()));
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    if (options?.minConnections) {
      const connectionCount = new Map<string, number>();
      for (const edge of edges) {
        connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1);
        connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1);
      }
      nodes = nodes.filter(
        (n) => (connectionCount.get(n.id) ?? 0) >= options.minConnections!,
      );
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    return { nodes, edges };
  }

  // ── Health Analysis ──────────────────────────────────────────────────────

  getHealthReport(companyId?: string): FleetMemoryHealth {
    const allTopics = new Set<string>();
    const botTopics = new Map<string, Set<string>>();
    const perBot: BotMemoryStats[] = [];

    // Collect per-bot stats — scoped to the requesting tenant so per-bot memory
    // stats, coverage topics, and gaps never expose another company's bots.
    for (const [botId, memories] of this.botMemories) {
      if (companyId && this.botCompanies.get(botId) !== companyId) continue;
      const botName = this.botNames.get(botId) ?? botId;
      const topics = new Set<string>();

      let totalAge = 0;
      let staleCount = 0;
      const now = Date.now();

      for (const memory of memories) {
        const ageDays = (now - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        totalAge += ageDays;

        const daysSinceAccess = (now - memory.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAccess > 30) staleCount++;

        const memTopics = this.extractTopics(memory.content);
        for (const t of memTopics) {
          topics.add(t);
          allTopics.add(t);
        }
      }

      botTopics.set(botId, topics);

      // Count conflicts for this bot
      const conflictCount = Array.from(this.conflicts.values()).filter(
        (c) =>
          c.status === "open" &&
          c.conflictingMemories.some((m) => m.botId === botId),
      ).length;

      perBot.push({
        botId,
        botName,
        totalMemories: memories.length,
        avgAgeDays: memories.length > 0 ? Math.round(totalAge / memories.length) : 0,
        staleCount,
        conflictCount,
        coverageTopics: Array.from(topics).slice(0, 20),
        gaps: [], // Filled below
      });
    }

    // Calculate gaps (topics other bots know but this one doesn't)
    for (const stat of perBot) {
      const myTopics = botTopics.get(stat.botId) ?? new Set();
      const otherTopics = new Set<string>();
      for (const [otherId, topics] of botTopics) {
        if (otherId !== stat.botId) {
          for (const t of topics) otherTopics.add(t);
        }
      }
      stat.gaps = Array.from(otherTopics)
        .filter((t) => !myTopics.has(t))
        .slice(0, 10);
    }

    // Fleet-level stats
    const totalMemories = perBot.reduce((sum, b) => sum + b.totalMemories, 0);

    // Cross-bot overlap: topics that appear in 2+ bots
    let overlapCount = 0;
    for (const topic of allTopics) {
      const botsWithTopic = Array.from(botTopics.values()).filter((topics) =>
        topics.has(topic),
      ).length;
      if (botsWithTopic >= 2) overlapCount++;
    }
    const crossBotOverlap = allTopics.size > 0 ? overlapCount / allTopics.size : 0;

    // Conflict rate (scoped to the requesting tenant)
    const openConflicts = Array.from(this.conflicts.values()).filter(
      (c) => c.status === "open" && (!companyId || c.companyId === companyId),
    ).length;
    const conflictRate = overlapCount > 0 ? openConflicts / overlapCount : 0;

    // Knowledge distribution
    const memoryCounts = perBot.map((b) => b.totalMemories);
    const maxMemories = Math.max(...memoryCounts, 1);
    const minMemories = Math.min(...memoryCounts);
    const ratio = minMemories / maxMemories;
    const distribution =
      ratio > 0.6 ? "balanced" : ratio > 0.3 ? "fragmented" : "concentrated";

    return {
      perBot,
      fleet: {
        totalMemories,
        uniqueTopics: allTopics.size,
        crossBotOverlap: Math.round(crossBotOverlap * 100) / 100,
        conflictRate: Math.round(conflictRate * 100) / 100,
        knowledgeDistribution: distribution,
      },
    };
  }

  // ── Knowledge Gaps ───────────────────────────────────────────────────────

  getGaps(companyId?: string): Array<{
    botId: string;
    botName: string;
    missingTopic: string;
    knownBy: string[];
    suggestion: string;
  }> {
    const health = this.getHealthReport(companyId);
    const gaps: Array<{
      botId: string;
      botName: string;
      missingTopic: string;
      knownBy: string[];
      suggestion: string;
    }> = [];

    for (const botStat of health.perBot) {
      for (const gap of botStat.gaps) {
        const knownBy = health.perBot
          .filter(
            (b) => b.botId !== botStat.botId && b.coverageTopics.includes(gap),
          )
          .map((b) => b.botName);

        if (knownBy.length > 0) {
          gaps.push({
            botId: botStat.botId,
            botName: botStat.botName,
            missingTopic: gap,
            knownBy,
            suggestion: `Consider delegating a knowledge-transfer task from ${knownBy[0]} to ${botStat.botName}`,
          });
        }
      }
    }

    return gaps.slice(0, 20);
  }

  // ── Manual Memory Injection (for testing) ────────────────────────────────

  injectMemory(botId: string, memory: MemoryEntry, companyId?: string): void {
    const existing = this.botMemories.get(botId) ?? [];
    existing.push(memory);
    this.botMemories.set(botId, existing);
    if (companyId) this.botCompanies.set(botId, companyId);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  private getTotalMemoryCount(companyId?: string): number {
    let total = 0;
    for (const [botId, memories] of this.botMemories) {
      if (companyId && this.botCompanies.get(botId) !== companyId) continue;
      total += memories.length;
    }
    return total;
  }

  getStats(companyId?: string): {
    totalMemories: number;
    totalBots: number;
    totalConflicts: number;
    graphNodes: number;
    graphEdges: number;
    searchesThisMinute: number;
  } {
    // Scope every count to the requesting tenant so the stat cards never reflect
    // another company's bots, memories, conflicts, or graph.
    const botIds = Array.from(this.botMemories.keys()).filter(
      (botId) => !companyId || this.botCompanies.get(botId) === companyId,
    );
    return {
      totalMemories: this.getTotalMemoryCount(companyId),
      totalBots: botIds.length,
      totalConflicts: Array.from(this.conflicts.values()).filter(
        (c) => c.status === "open" && (!companyId || c.companyId === companyId),
      ).length,
      graphNodes: this.knowledgeGraph.nodes.filter(
        (n) => !companyId || n.companyId === companyId,
      ).length,
      graphEdges: companyId
        ? (() => {
            const ids = new Set(
              this.knowledgeGraph.nodes
                .filter((n) => n.companyId === companyId)
                .map((n) => n.id),
            );
            return this.knowledgeGraph.edges.filter(
              (e) => ids.has(e.source) && ids.has(e.target),
            ).length;
          })()
        : this.knowledgeGraph.edges.length,
      searchesThisMinute: this.searchCount,
    };
  }
}
