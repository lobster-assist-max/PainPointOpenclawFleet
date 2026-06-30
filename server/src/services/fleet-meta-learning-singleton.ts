import { MetaLearningEngine, type FleetMetricsSnapshot } from "./fleet-meta-learning.js";
import { getQualityEngine } from "./fleet-quality.js";
import { getHealingPolicyEngine } from "./fleet-healing.js";

let instance: MetaLearningEngine | null = null;

/**
 * Snapshot the fleet outcome metrics the meta-learning bandit observes.
 * avgCqi / slaCompliance are read from the real CQI engine (#164) and
 * healingSuccessRate from the self-healing engine (#179). Fields with no
 * synchronous fleet-wide source yet (latency/cost/routing/delegation/journey)
 * keep representative defaults rather than fabricated "live" numbers.
 */
function snapshotFleetMetrics(
  period: FleetMetricsSnapshot["period"],
): FleetMetricsSnapshot {
  const quality = getQualityEngine().getFleetQuality();
  const healing = getHealingPolicyEngine().getStats();
  const healingDecided = healing.succeeded + healing.failed;

  return {
    timestamp: new Date(),
    period,
    avgCqi: quality.fleetAvg, // real fleet CQI (0 when no bots scored yet)
    avgResponseTimeMs: 7000, // no fleet-wide latency source yet
    slaCompliance: quality.dimensions.reliability, // CQI reliability dimension
    totalCost: 0,
    costPerSession: 0.3,
    healingSuccessRate: healingDecided > 0 ? healing.succeeded / healingDecided : 1,
    routingEfficiency: 5,
    delegationSuccessRate: 0.85,
    conversionRate: 0.03,
    customerJourneyHealthAvg: 75,
    sessionCount: 0,
  };
}

export function getMetaLearningEngine(): MetaLearningEngine {
  if (!instance) {
    instance = new MetaLearningEngine({
      getCurrentMetrics: snapshotFleetMetrics,
    });
  }
  return instance;
}

export function disposeMetaLearningEngine(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
