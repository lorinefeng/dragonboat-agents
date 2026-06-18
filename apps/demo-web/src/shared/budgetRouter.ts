export type BudgetRouteStatus = "blocked" | "human_approval_required" | "selected";
export type SubscriptionStatus = "degraded" | "healthy" | "unavailable";

export interface ModelRouteCandidate {
  capabilities: string[];
  effort?: string;
  estimatedQualityRisk: number;
  model: string;
  pricePer1kInput: number;
  pricePer1kOutput: number;
  provider: string;
  subscriptionId: string;
}

export interface SubscriptionBudget {
  id: string;
  maxConcurrency: number;
  remainingUsd?: number;
  status: SubscriptionStatus;
  usedConcurrency: number;
}

export interface BudgetRouteRequirements {
  maxEstimatedCostUsd?: number;
  qualityRiskTolerance?: number;
  requiredCapabilities: string[];
  taskClass: string;
  tokenEstimate: {
    input: number;
    output: number;
  };
}

export interface RejectedRoute {
  estimatedCostUsd: number;
  model: string;
  provider: string;
  reasons: string[];
  subscriptionId: string;
}

export interface BudgetAwareRoutingDecision {
  estimatedCostUsd: number;
  rejected: RejectedRoute[];
  selected?: ModelRouteCandidate;
  status: BudgetRouteStatus;
  subscriptionId?: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function estimatedCost(candidate: ModelRouteCandidate, requirements: BudgetRouteRequirements) {
  return (
    (requirements.tokenEstimate.input / 1000) * candidate.pricePer1kInput +
    (requirements.tokenEstimate.output / 1000) * candidate.pricePer1kOutput
  );
}

function routeReasons(
  candidate: ModelRouteCandidate,
  subscription: SubscriptionBudget | undefined,
  requirements: BudgetRouteRequirements
) {
  const reasons: string[] = [];
  const candidateCapabilities = new Set(candidate.capabilities.map(normalize));

  for (const capability of requirements.requiredCapabilities.map(normalize)) {
    if (!candidateCapabilities.has(capability)) {
      reasons.push(`missing_capability:${capability}`);
    }
  }

  if (!subscription) {
    reasons.push("subscription_missing");
  } else {
    if (subscription.status !== "healthy") {
      reasons.push(`subscription_${subscription.status}`);
    }
    if (subscription.usedConcurrency >= subscription.maxConcurrency) {
      reasons.push("concurrency_exhausted");
    }
    const cost = estimatedCost(candidate, requirements);
    if (typeof subscription.remainingUsd === "number" && subscription.remainingUsd < cost) {
      reasons.push("remaining_budget_exhausted");
    }
  }

  if (
    typeof requirements.qualityRiskTolerance === "number" &&
    candidate.estimatedQualityRisk > requirements.qualityRiskTolerance
  ) {
    reasons.push("quality_risk_exceeds_tolerance");
  }

  if (
    typeof requirements.maxEstimatedCostUsd === "number" &&
    estimatedCost(candidate, requirements) > requirements.maxEstimatedCostUsd
  ) {
    reasons.push("estimated_cost_exceeds_task_cap");
  }

  return reasons;
}

export function selectBudgetAwareRoute(input: {
  candidates: ModelRouteCandidate[];
  requirements: BudgetRouteRequirements;
  subscriptions: SubscriptionBudget[];
}): BudgetAwareRoutingDecision {
  const subscriptions = new Map(input.subscriptions.map((subscription) => [subscription.id, subscription]));
  const rejected: RejectedRoute[] = [];
  const viable = input.candidates
    .map((candidate) => {
      const subscription = subscriptions.get(candidate.subscriptionId);
      const cost = estimatedCost(candidate, input.requirements);
      const reasons = routeReasons(candidate, subscription, input.requirements);

      if (reasons.length > 0) {
        rejected.push({
          estimatedCostUsd: cost,
          model: candidate.model,
          provider: candidate.provider,
          reasons,
          subscriptionId: candidate.subscriptionId
        });
      }

      return {
        candidate,
        cost,
        reasons,
        score: cost + candidate.estimatedQualityRisk
      };
    })
    .filter((item) => item.reasons.length === 0)
    .sort((left, right) => left.score - right.score);

  const selected = viable.at(0);
  if (selected) {
    return {
      estimatedCostUsd: selected.cost,
      rejected,
      selected: selected.candidate,
      status: "selected",
      subscriptionId: selected.candidate.subscriptionId
    };
  }

  const hasHealthyButTooExpensive = rejected.some(
    (item) =>
      item.reasons.includes("estimated_cost_exceeds_task_cap") ||
      item.reasons.includes("remaining_budget_exhausted") ||
      item.reasons.includes("concurrency_exhausted")
  );

  return {
    estimatedCostUsd: Math.min(...rejected.map((item) => item.estimatedCostUsd), Number.POSITIVE_INFINITY),
    rejected,
    status: hasHealthyButTooExpensive ? "human_approval_required" : "blocked"
  };
}
