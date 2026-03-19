import { AnomalyCorrelationEngine } from "./fleet-anomaly-correlation.js";

let instance: AnomalyCorrelationEngine | null = null;

export function getAnomalyCorrelationEngine(): AnomalyCorrelationEngine {
  if (!instance) {
    instance = new AnomalyCorrelationEngine();
  }
  return instance;
}

export function disposeAnomalyCorrelationEngine(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
