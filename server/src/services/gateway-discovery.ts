/**
 * GatewayDiscoveryService — Discovers OpenClaw Gateways on the local network via mDNS/Bonjour.
 *
 * OpenClaw Gateway broadcasts: _openclaw-gw._tcp with TXT records for version, deviceId, hostname.
 * This service listens for those broadcasts and maintains a list of discovered gateways.
 */

import { EventEmitter } from "node:events";

export interface DiscoveredGateway {
  id: string;
  host: string;
  port: number;
  version: string | null;
  hostname: string | null;
  tls: boolean;
  url: string;
  discoveredAt: Date;
  lastSeenAt: Date;
}

export class GatewayDiscoveryService extends EventEmitter {
  private discovered = new Map<string, DiscoveredGateway>();
  private browser: unknown = null;
  private bonjourInstance: unknown = null;
  private started = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Start listening for mDNS broadcasts. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Attempt to load bonjour-service (optional dependency)
    void this.initBrowser();

    // Clean up stale entries every 60s (remove gateways not seen in 5 min)
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 5 * 60_000;
      for (const [id, gw] of this.discovered) {
        if (gw.lastSeenAt.getTime() < cutoff) {
          this.discovered.delete(id);
          this.emit("gateway-lost", gw);
        }
      }
    }, 60_000);
  }

  private async initBrowser(): Promise<void> {
    try {
      // Dynamic import — bonjour-service may not be installed
      const bonjourModule = "bonjour-service";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Bonjour } = await import(/* webpackIgnore: true */ bonjourModule);
      this.bonjourInstance = new Bonjour();
      this.browser = (this.bonjourInstance as any).find(
        { type: "openclaw-gw" },
        (service: any) => {
          this.handleServiceFound(service);
        },
      );
    } catch {
      // bonjour-service not available — mDNS discovery disabled
      // This is expected in environments without the optional dependency
    }
  }

  private handleServiceFound(service: any): void {
    const txt = service.txt ?? {};
    const id = txt.deviceId ?? service.name ?? `${service.host}:${service.port}`;
    const tls = txt.tls === "true";
    const protocol = tls ? "wss" : "ws";

    const gateway: DiscoveredGateway = {
      id,
      host: service.host ?? service.referer?.address ?? "unknown",
      port: service.port ?? 18789,
      version: txt.version ?? null,
      hostname: txt.hostname ?? service.host ?? null,
      tls,
      url: `${protocol}://${service.host ?? "unknown"}:${service.port ?? 18789}`,
      discoveredAt: this.discovered.has(id)
        ? this.discovered.get(id)!.discoveredAt
        : new Date(),
      lastSeenAt: new Date(),
    };

    const isNew = !this.discovered.has(id);
    this.discovered.set(id, gateway);

    if (isNew) {
      this.emit("gateway-found", gateway);
    }
  }

  /** Get all currently discovered gateways. */
  getDiscovered(): DiscoveredGateway[] {
    return Array.from(this.discovered.values());
  }

  /** Force a fresh scan. Existing browser continues; we just clear stale entries. */
  refresh(): void {
    // Re-trigger the browser if it exists
    if (this.browser && typeof (this.browser as any).update === "function") {
      (this.browser as any).update();
    }
  }

  /** Stop discovery and clean up. */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.browser && typeof (this.browser as any).stop === "function") {
      (this.browser as any).stop();
    }
    if (this.bonjourInstance && typeof (this.bonjourInstance as any).destroy === "function") {
      (this.bonjourInstance as any).destroy();
    }
    this.discovered.clear();
    this.started = false;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: GatewayDiscoveryService | null = null;

export function getGatewayDiscoveryService(): GatewayDiscoveryService {
  if (!_instance) {
    _instance = new GatewayDiscoveryService();
    _instance.start();
  }
  return _instance;
}
