import { CustomerJourneyEngine } from "./fleet-customer-journey.js";
import { getFleetMonitorService } from "./fleet-monitor.js";

let instance: CustomerJourneyEngine | null = null;

export function getCustomerJourneyEngine(): CustomerJourneyEngine {
  if (!instance) {
    const monitor = getFleetMonitorService();
    instance = new CustomerJourneyEngine({
      getBots: () =>
        monitor.getAllBots().map((b) => ({
          id: b.botId,
          name: b.botId,
          gatewayUrl: b.gatewayUrl ?? "",
        })),
    });
  }
  return instance;
}

export function disposeCustomerJourneyEngine(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
