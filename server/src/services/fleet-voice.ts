/**
 * Fleet Voice Intelligence Engine
 *
 * In-memory service for voice call analytics, sentiment tracking, and survey insights.
 */

interface VoiceCall {
  id: string;
  botId: string;
  status: string;
  duration: number;
  sentiment: number;
  createdAt: string;
}

interface SentimentPoint {
  timestamp: string;
  score: number;
}

interface VoiceAnalytics {
  totalCalls: number;
  avgDuration: number;
  avgSentiment: number;
}

interface QualityTrend {
  date: string;
  score: number;
}

interface SurveyFunnel {
  started: number;
  completed: number;
  abandoned: number;
}

interface SurveyQuestion {
  id: string;
  text: string;
  avgScore: number;
  responseCount: number;
}

interface Anomaly {
  callId: string;
  reason: string;
  severity: string;
  detectedAt: string;
}

export interface VoiceIntelligenceEngine {
  listCalls(opts: { botId?: string; status?: string; limit: number; offset: number }): VoiceCall[];
  getCall(id: string): VoiceCall | null;
  getCallSentiment(id: string): SentimentPoint[] | null;
  getAnalytics(): VoiceAnalytics;
  getQualityTrends(): QualityTrend[];
  getSurveyFunnel(): SurveyFunnel;
  getSurveyQuestions(): SurveyQuestion[];
  getAnomalies(): Anomaly[];
}

export function createVoiceIntelligenceEngine(): VoiceIntelligenceEngine {
  const calls = new Map<string, VoiceCall>();

  return {
    listCalls({ botId, status, limit, offset }) {
      let items = Array.from(calls.values());
      if (botId) items = items.filter((c) => c.botId === botId);
      if (status) items = items.filter((c) => c.status === status);
      return items.slice(offset, offset + limit);
    },
    getCall(id) {
      return calls.get(id) ?? null;
    },
    getCallSentiment(id) {
      if (!calls.has(id)) return null;
      return [];
    },
    getAnalytics() {
      return { totalCalls: calls.size, avgDuration: 0, avgSentiment: 0 };
    },
    getQualityTrends() {
      return [];
    },
    getSurveyFunnel() {
      return { started: 0, completed: 0, abandoned: 0 };
    },
    getSurveyQuestions() {
      return [];
    },
    getAnomalies() {
      return [];
    },
  };
}
