import type { BenchmarkRecord } from "./benchmarkHarness.ts";
import type { CapabilityMatrix } from "./capabilityMatrix.ts";
import type { CostTrace } from "./costTrace.ts";

export type SubscriptionAdviceAction = "add" | "cancel" | "downgrade" | "keep" | "shift_to_local" | "upgrade";

export interface SubscriptionInventoryItem {
  capabilities: string[];
  id: string;
  monthlyPriceUsd: number;
  provider: string;
  status: "healthy" | "unused" | "overloaded" | "unavailable";
  usageShare?: number;
}

export interface SubscriptionAdvice {
  action: SubscriptionAdviceAction;
  confidence: number;
  id: string;
  reason: string;
}

export interface SubscriptionAdvisorReport {
  estimatedMonthlySavingsUsd: number;
  recommendations: SubscriptionAdvice[];
  summary: string;
}

function premiumRatio(records: BenchmarkRecord[]) {
  const ratios = records
    .map((record) => record.premium_token_ratio)
    .filter((ratio): ratio is number => typeof ratio === "number" && Number.isFinite(ratio));
  if (ratios.length === 0) {
    return 0;
  }
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function highSuccessLocalModels(matrix?: CapabilityMatrix) {
  if (!matrix) {
    return [];
  }
  return Object.entries(matrix.models)
    .filter(([model, profile]) => model.includes("local") || profile.capabilities.includes("local_llm"))
    .filter(([, profile]) => profile.successRate >= 0.75)
    .map(([model]) => model);
}

export function createSubscriptionAdvisorReport(input: {
  benchmarkRecords?: BenchmarkRecord[];
  capabilityMatrix?: CapabilityMatrix;
  costTrace?: CostTrace;
  subscriptions: SubscriptionInventoryItem[];
}): SubscriptionAdvisorReport {
  const recommendations: SubscriptionAdvice[] = [];
  const records = input.benchmarkRecords ?? [];
  const wasteRatio =
    input.costTrace && input.costTrace.totalEstimatedCostUsd > 0
      ? input.costTrace.wastedEstimatedCostUsd / input.costTrace.totalEstimatedCostUsd
      : 0;
  const localModels = highSuccessLocalModels(input.capabilityMatrix);
  const averagePremiumRatio = premiumRatio(records);

  for (const subscription of input.subscriptions) {
    if (subscription.status === "unavailable") {
      recommendations.push({
        action: "cancel",
        confidence: 0.8,
        id: subscription.id,
        reason: "Provider is unavailable in traces; do not route paid work until health recovers."
      });
    } else if ((subscription.usageShare ?? 0) < 0.05 && subscription.monthlyPriceUsd > 0) {
      recommendations.push({
        action: "downgrade",
        confidence: 0.7,
        id: subscription.id,
        reason: "Subscription has low observed usage share compared with its monthly price."
      });
    } else if (subscription.status === "overloaded") {
      recommendations.push({
        action: "upgrade",
        confidence: 0.65,
        id: subscription.id,
        reason: "Concurrency is saturated; upgrade only if benchmark records show the route improves acceptance."
      });
    } else {
      recommendations.push({
        action: "keep",
        confidence: 0.55,
        id: subscription.id,
        reason: "No strong downgrade or upgrade signal was found."
      });
    }
  }

  if (wasteRatio >= 0.25 || averagePremiumRatio >= 0.65) {
    recommendations.push({
      action: localModels.length > 0 ? "shift_to_local" : "add",
      confidence: 0.75,
      id: localModels.at(0) ?? "local-low-cost-worker",
      reason:
        localModels.length > 0
          ? "High premium or wasted spend is present and a local-capable model has acceptable historical success."
          : "High premium or wasted spend is present; add a low-cost local worker route for scanning, logs, and test summarization."
    });
  }

  const estimatedMonthlySavingsUsd = input.subscriptions
    .filter((subscription) => recommendations.some((advice) => advice.id === subscription.id && ["cancel", "downgrade"].includes(advice.action)))
    .reduce((sum, subscription) => sum + subscription.monthlyPriceUsd * 0.5, 0);

  return {
    estimatedMonthlySavingsUsd,
    recommendations,
    summary:
      recommendations.some((advice) => advice.action === "shift_to_local" || advice.action === "add")
        ? "Premium spend can likely be reduced by moving low-uncertainty work to cheaper/local workers."
        : "No urgent purchase change was detected; keep collecting trace data."
  };
}
