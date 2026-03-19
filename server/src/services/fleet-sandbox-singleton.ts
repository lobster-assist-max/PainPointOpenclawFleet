import { FleetSandboxEngine, type SandboxMetrics } from "./fleet-sandbox.js";

let instance: FleetSandboxEngine | null = null;

export function getFleetSandboxEngine(): FleetSandboxEngine {
  if (!instance) {
    instance = new FleetSandboxEngine({
      getCurrentMetrics(): SandboxMetrics {
        // Placeholder — in production, read from FleetMonitorService
        return {
          timestamp: new Date(),
          avgCqi: 81,
          avgResponseTimeMs: 7400,
          errorRate: 3.4,
          slaCompliance: 94,
          totalCost: 0,
          costPerSession: 0.31,
          sessionCount: 0,
          routingEfficiency: 4.7,
          healingSuccessRate: 0.91,
        };
      },
    });
  }
  return instance;
}

export function disposeFleetSandboxEngine(): void {
  instance = null;
}
