/**
 * Fleet Bot Discovery API
 *
 * GET /api/fleet/discover
 *   Scans local ports + mDNS to find running OpenClaw bots on the network.
 *   Returns a unified list with health-probed bot metadata.
 *
 * POST /api/fleet/discover/probe
 *   Probe a single gateway URL to verify connectivity and fetch bot info.
 */

import { Router } from "express";
import http from "node:http";
import os from "node:os";

// Ports commonly used by OpenClaw Gateway instances
const SCAN_PORTS = [18789, 18790, 18793, 18797, 18800];

// Timeout for each probe request (ms)
const PROBE_TIMEOUT = 3000;

export interface DiscoveredBot {
  url: string;
  name: string;
  emoji: string;
  status: "online" | "offline" | "unknown";
  machine: string;
  source: "local-scan" | "mdns" | "tailscale" | "manual";
  port: number;
  host: string;
  gatewayVersion: string | null;
  skills: string[];
  identityRole: string | null;
}

/**
 * Probe a single HTTP endpoint for /health and return bot info.
 */
async function probeGateway(
  baseUrl: string,
  source: DiscoveredBot["source"],
  machine: string,
): Promise<DiscoveredBot | null> {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(healthUrl);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const req = http.get(
      healthUrl,
      { timeout: PROBE_TIMEOUT },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve({
              url: baseUrl.replace(/\/$/, ""),
              name: data.name || data.botName || `Bot :${parsedUrl.port || 80}`,
              emoji: data.emoji || "\uD83E\uDD16",
              status: "online",
              machine,
              source,
              port: Number(parsedUrl.port) || 80,
              host: parsedUrl.hostname,
              gatewayVersion: data.version || data.gatewayVersion || null,
              skills: Array.isArray(data.skills) ? data.skills : [],
              identityRole: data.role || data.identityRole || null,
            });
          } catch {
            // Got a 200 but non-JSON response — still treat as online
            resolve({
              url: baseUrl.replace(/\/$/, ""),
              name: `Bot :${parsedUrl.port || 80}`,
              emoji: "\uD83E\uDD16",
              status: "online",
              machine,
              source,
              port: Number(parsedUrl.port) || 80,
              host: parsedUrl.hostname,
              gatewayVersion: null,
              skills: [],
              identityRole: null,
            });
          }
        });
      },
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Scan localhost ports concurrently for OpenClaw Gateways.
 */
async function scanLocalPorts(): Promise<DiscoveredBot[]> {
  const hostname = os.hostname();
  const probes = SCAN_PORTS.map((port) =>
    probeGateway(`http://127.0.0.1:${port}`, "local-scan", hostname),
  );
  const results = await Promise.all(probes);
  return results.filter((b): b is DiscoveredBot => b !== null);
}

/**
 * Get mDNS-discovered gateways and probe them for health data.
 */
async function scanMdns(): Promise<DiscoveredBot[]> {
  try {
    const { getGatewayDiscoveryService } = await import(
      "../services/gateway-discovery.js"
    );
    const discovery = getGatewayDiscoveryService();
    const gateways = discovery.getDiscovered();

    const probes = gateways.map((gw) => {
      const httpUrl = `http://${gw.host}:${gw.port}`;
      return probeGateway(httpUrl, "mdns", gw.hostname || gw.host);
    });

    const results = await Promise.all(probes);
    return results.filter((b): b is DiscoveredBot => b !== null);
  } catch {
    return [];
  }
}

/**
 * Scan Tailscale network for common gateway ports.
 * Reads Tailscale status to get peer IPs, then probes them.
 */
async function scanTailscale(): Promise<DiscoveredBot[]> {
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("tailscale status --json 2>/dev/null", {
      encoding: "utf8",
      timeout: 5000,
    });
    const status = JSON.parse(output);
    const peers = Object.values(status.Peer ?? {}) as Array<{
      TailscaleIPs?: string[];
      HostName?: string;
      Online?: boolean;
    }>;

    const onlinePeers = peers.filter((p) => p.Online && p.TailscaleIPs?.length);
    const probes: Promise<DiscoveredBot | null>[] = [];

    for (const peer of onlinePeers) {
      const ip = peer.TailscaleIPs![0];
      for (const port of SCAN_PORTS) {
        probes.push(
          probeGateway(`http://${ip}:${port}`, "tailscale", peer.HostName || ip),
        );
      }
    }

    const results = await Promise.all(probes);
    return results.filter((b): b is DiscoveredBot => b !== null);
  } catch {
    return [];
  }
}

export function fleetDiscoverRoutes() {
  const router = Router();

  /**
   * GET /api/fleet/discover
   * Scan local ports + mDNS + Tailscale for OpenClaw bots.
   */
  router.get("/discover", async (_req, res) => {
    try {
      // Run all scanners concurrently
      const [localBots, mdnsBots, tailscaleBots] = await Promise.all([
        scanLocalPorts(),
        scanMdns(),
        scanTailscale(),
      ]);

      // Merge and deduplicate by normalized URL
      const merged = new Map<string, DiscoveredBot>();
      for (const bot of [...localBots, ...mdnsBots, ...tailscaleBots]) {
        const key = bot.url.replace(/\/$/, "").toLowerCase();
        if (!merged.has(key)) {
          merged.set(key, bot);
        }
      }

      res.json({
        ok: true,
        bots: Array.from(merged.values()),
        scannedPorts: SCAN_PORTS,
        scanSources: ["local-scan", "mdns", "tailscale"],
        hostname: os.hostname(),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        ok: false,
        error: `Discovery failed: ${message}`,
        bots: [],
      });
    }
  });

  /**
   * POST /api/fleet/discover/probe
   * Probe a single gateway URL. Used for manual connect verification.
   * Body: { url: string }
   */
  router.post("/discover/probe", async (req, res) => {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ ok: false, error: "Missing url in request body" });
      return;
    }

    try {
      const bot = await probeGateway(url, "manual", "manual");
      if (bot) {
        res.json({ ok: true, bot });
      } else {
        res.json({ ok: false, error: "Gateway not reachable or not responding" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: `Probe failed: ${message}` });
    }
  });

  return router;
}
