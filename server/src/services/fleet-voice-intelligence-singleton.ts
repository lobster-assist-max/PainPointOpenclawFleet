import { VoiceIntelligenceEngine } from "./fleet-voice-intelligence.js";

let instance: VoiceIntelligenceEngine | null = null;

export function getVoiceIntelligenceEngine(): VoiceIntelligenceEngine {
  if (!instance) {
    instance = new VoiceIntelligenceEngine();
  }
  return instance;
}

export function disposeVoiceIntelligenceEngine(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
