import { FleetSandboxEngine, type SandboxMetrics } from "./fleet-sandbox.js";
import { getQualityEngine } from "./fleet-quality.js";
import { getHealingPolicyEngine } from "./fleet-healing.js";

let instance: FleetSandboxEngine | null = null;

/**
 * Snapshot the live production baseline the sandbox compares against.
 * avgCqi / slaCompliance come from the real CQI engine (#164) and
 * healingSuccessRate from the self-healing engine (#179). Fields with no
 * synchronous fleet-wide source yet (latency/error/cost/routing) fall back to
 * representative defaults rather than fabricated "live" numbers.
 */
function getProductionBaseline(): SandboxMetrics {
  const quality = getQualityEngine().getFleetQuality();
  const healing = getHealingPolicyEngine().getStats();
  const healingDecided = healing.succeeded + healing.failed;

  return {
    timestamp: new Date(),
    avgCqi: quality.fleetAvg, // real fleet CQI (0 when no bots scored yet)
    avgResponseTimeMs: 7400, // no fleet-wide latency source yet
    errorRate: 3.4, // no fleet-wide error-rate source yet
    slaCompliance: quality.dimensions.reliability, // CQI reliability dimension
    totalCost: 0,
    costPerSession: 0.31,
    sessionCount: 0,
    routingEfficiency: 4.7,
    healingSuccessRate: healingDecided > 0 ? healing.succeeded / healingDecided : 1,
  };
}

export function getFleetSandboxEngine(): FleetSandboxEngine {
  if (!instance) {
    instance = new FleetSandboxEngine({
      getCurrentMetrics: getProductionBaseline,
    });
  }
  return instance;
}

export function disposeFleetSandboxEngine(): void {
  instance = null;
}
