/**
 * Fleet Rate Limiter — Respects Gateway rate limits to avoid lockouts.
 *
 * Gateway rate limits:
 * - Auth: 10 failed attempts per 60s → 429 + lockout 300s
 * - Config writes: 3 requests per 60s per deviceId+clientIp
 *
 * This service tracks usage per gateway and:
 * - Prevents auth attempts when near the limit (reserves 2 attempts)
 * - Queues config writes to stay under 3/min
 * - Supports batch config pushes with automatic spacing
 */

import { logger } from "../middleware/logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RateLimitStatus {
  gatewayUrl: string;
  authFailures: number;
  authLocked: boolean;
  authLockExpiresAt: number | null;
  configWritesThisMinute: number;
  configWriteAvailableIn: number;
}

interface ConfigPatchJob {
  gatewayUrl: string;
  botId: string;
  path: string;
  value: unknown;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  priority: "critical" | "normal";
  enqueuedAt: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_SAFE_MARGIN = 2; // Reserve 2 attempts
const AUTH_LOCKOUT_MS = 300_000;

const CONFIG_WRITE_WINDOW_MS = 60_000;
const CONFIG_WRITE_MAX = 3;

// ─── Gateway Rate Tracker ──────────────────────────────────────────────────

class GatewayRateTracker {
  readonly gatewayUrl: string;
  private authFailureTimestamps: number[] = [];
  private configWriteTimestamps: number[] = [];
  private lockedUntil: number | null = null;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
  }

  // ─── Auth rate limiting ───────────────────────────────────────────────

  canAttemptAuth(): boolean {
    if (this.lockedUntil && Date.now() < this.lockedUntil) return false;
    if (this.lockedUntil && Date.now() >= this.lockedUntil) {
      this.lockedUntil = null;
      this.authFailureTimestamps = [];
    }
    this.cleanExpired(this.authFailureTimestamps, AUTH_WINDOW_MS);
    return this.authFailureTimestamps.length < AUTH_MAX_ATTEMPTS - AUTH_SAFE_MARGIN;
  }

  recordAuthFailure(): void {
    this.authFailureTimestamps.push(Date.now());
    if (this.authFailureTimestamps.length >= AUTH_MAX_ATTEMPTS - AUTH_SAFE_MARGIN) {
      // Proactively lock ourselves before Gateway does
      this.lockedUntil = Date.now() + AUTH_LOCKOUT_MS;
      logger.warn(
        { gatewayUrl: this.gatewayUrl, lockoutMs: AUTH_LOCKOUT_MS },
        "[Fleet Rate Limiter] Self-locking auth — too many failures",
      );
    }
  }

  recordAuthSuccess(): void {
    this.authFailureTimestamps = [];
    this.lockedUntil = null;
  }

  // ─── Config write rate limiting ───────────────────────────────────────

  canWriteConfig(): boolean {
    this.cleanExpired(this.configWriteTimestamps, CONFIG_WRITE_WINDOW_MS);
    return this.configWriteTimestamps.length < CONFIG_WRITE_MAX;
  }

  recordConfigWrite(): void {
    this.configWriteTimestamps.push(Date.now());
  }

  /**
   * Returns milliseconds until the next config write slot opens.
   * Returns 0 if a slot is available now.
   */
  nextConfigWriteAvailableInMs(): number {
    this.cleanExpired(this.configWriteTimestamps, CONFIG_WRITE_WINDOW_MS);
    if (this.configWriteTimestamps.length < CONFIG_WRITE_MAX) return 0;
    return CONFIG_WRITE_WINDOW_MS - (Date.now() - this.configWriteTimestamps[0]);
  }

  // ─── Status ───────────────────────────────────────────────────────────

  getStatus(): RateLimitStatus {
    this.cleanExpired(this.authFailureTimestamps, AUTH_WINDOW_MS);
    this.cleanExpired(this.configWriteTimestamps, CONFIG_WRITE_WINDOW_MS);

    return {
      gatewayUrl: this.gatewayUrl,
      authFailures: this.authFailureTimestamps.length,
      authLocked: this.lockedUntil != null && Date.now() < this.lockedUntil,
      authLockExpiresAt: this.lockedUntil,
      configWritesThisMinute: this.configWriteTimestamps.length,
      configWriteAvailableIn: this.nextConfigWriteAvailableInMs(),
    };
  }

  private cleanExpired(timestamps: number[], windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }
}

// ─── Batch Config Queue ────────────────────────────────────────────────────

class BatchConfigQueue {
  private queue: ConfigPatchJob[] = [];
  private processing = false;
  private processTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private rateLimiter: FleetRateLimiter) {}

  /**
   * Enqueue a config patch job. Returns a promise that resolves when the
   * job is actually executed (may be delayed by rate limiting).
   */
  enqueue(
    gatewayUrl: string,
    botId: string,
    path: string,
    value: unknown,
    execute: () => Promise<unknown>,
    priority: "critical" | "normal" = "normal",
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        gatewayUrl,
        botId,
        path,
        value,
        execute,
        resolve,
        reject,
        priority,
        enqueuedAt: Date.now(),
      });

      // Sort: critical first, then by enqueue time
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === "critical" ? -1 : 1;
        return a.enqueuedAt - b.enqueuedAt;
      });

      this.scheduleProcessing();
    });
  }

  /** Number of jobs waiting in queue. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Estimated time to complete all queued jobs (ms). */
  get estimatedCompletionMs(): number {
    if (this.queue.length === 0) return 0;
    // Group by gateway URL, each gateway can do 3/min
    const byGateway = new Map<string, number>();
    for (const job of this.queue) {
      byGateway.set(job.gatewayUrl, (byGateway.get(job.gatewayUrl) ?? 0) + 1);
    }
    let maxWait = 0;
    for (const [url, count] of byGateway) {
      const tracker = this.rateLimiter.getTracker(url);
      const available = CONFIG_WRITE_MAX - tracker.getStatus().configWritesThisMinute;
      const remaining = count - available;
      if (remaining > 0) {
        const minutesNeeded = Math.ceil(remaining / CONFIG_WRITE_MAX);
        maxWait = Math.max(maxWait, minutesNeeded * CONFIG_WRITE_WINDOW_MS);
      }
    }
    return maxWait;
  }

  /** Cancel all pending jobs for a specific bot. */
  cancelForBot(botId: string): number {
    const before = this.queue.length;
    const cancelled = this.queue.filter((j) => j.botId === botId);
    this.queue = this.queue.filter((j) => j.botId !== botId);
    for (const job of cancelled) {
      job.reject(new Error("Cancelled"));
    }
    return before - this.queue.length;
  }

  private scheduleProcessing(): void {
    if (this.processing || this.processTimer) return;
    this.processTimer = setTimeout(() => {
      this.processTimer = null;
      this.processNext();
    }, 100);
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue[0];
      const tracker = this.rateLimiter.getTracker(job.gatewayUrl);

      if (!tracker.canWriteConfig()) {
        const waitMs = tracker.nextConfigWriteAvailableInMs();
        logger.debug(
          { gatewayUrl: job.gatewayUrl, waitMs, queueLength: this.queue.length },
          "[Fleet Batch Queue] Waiting for rate limit window",
        );
        await delay(Math.min(waitMs + 500, 65_000));
        continue;
      }

      this.queue.shift();

      try {
        const result = await job.execute();
        tracker.recordConfigWrite();
        job.resolve(result);
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Fleet Rate Limiter (main service) ──────────────────────────────────────

export class FleetRateLimiter {
  private trackers = new Map<string, GatewayRateTracker>();
  readonly batchQueue: BatchConfigQueue;

  constructor() {
    this.batchQueue = new BatchConfigQueue(this);
  }

  getTracker(gatewayUrl: string): GatewayRateTracker {
    if (!this.trackers.has(gatewayUrl)) {
      this.trackers.set(gatewayUrl, new GatewayRateTracker(gatewayUrl));
    }
    return this.trackers.get(gatewayUrl)!;
  }

  /** Get rate limit status for all tracked gateways. */
  getAllStatus(): RateLimitStatus[] {
    return Array.from(this.trackers.values()).map((t) => t.getStatus());
  }

  /** Remove tracker for a gateway (e.g., when bot is disconnected). */
  removeTracker(gatewayUrl: string): void {
    this.trackers.delete(gatewayUrl);
  }

  dispose(): void {
    this.trackers.clear();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: FleetRateLimiter | null = null;

export function getFleetRateLimiter(): FleetRateLimiter {
  if (!instance) instance = new FleetRateLimiter();
  return instance;
}

export function disposeFleetRateLimiter(): void {
  instance?.dispose();
  instance = null;
}
