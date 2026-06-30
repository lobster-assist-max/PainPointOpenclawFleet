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
      // Backfill journeys from existing sessions over the gateway RPC, so the
      // Customer Journey page reflects historical sessions — not just live
      // chat events captured by the #175 botEvent feed after server start.
      getBotSessions: (botId) => monitor.getBotSessions(botId),
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
