import { MemoryMeshEngine } from "./fleet-memory-mesh.js";
import { getFleetMonitorService } from "./fleet-monitor.js";

let instance: MemoryMeshEngine | null = null;

export function getMemoryMeshEngine(): MemoryMeshEngine {
  if (!instance) {
    const monitor = getFleetMonitorService();
    instance = new MemoryMeshEngine({
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

export function disposeMemoryMeshEngine(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
