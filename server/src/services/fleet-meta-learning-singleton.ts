import { MetaLearningEngine, type FleetMetricsSnapshot } from "./fleet-meta-learning.js";

let instance: MetaLearningEngine | null = null;

export function getMetaLearningEngine(): MetaLearningEngine {
  if (!instance) {
    instance = new MetaLearningEngine({
      getCurrentMetrics(period): FleetMetricsSnapshot {
        // Placeholder — in production, aggregate from FleetMonitorService
        return {
          timestamp: new Date(),
          period,
          avgCqi: 80,
          avgResponseTimeMs: 7000,
          slaCompliance: 95,
          totalCost: 0,
          costPerSession: 0.3,
          healingSuccessRate: 0.9,
          routingEfficiency: 5,
          delegationSuccessRate: 0.85,
          conversionRate: 0.03,
          customerJourneyHealthAvg: 75,
          sessionCount: 0,
        };
      },
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
