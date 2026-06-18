export type ComputeWorkerKind = "docker" | "github_actions" | "kubernetes" | "local" | "remote_gpu" | "remote_ssh";
export type ComputeWorkerStatus = "degraded" | "healthy" | "unavailable";
export type ComputePlacementStatus = "blocked" | "human_approval_required" | "selected";

export interface ComputeWorker {
  capabilities: string[];
  costPerMinuteUsd?: number;
  id: string;
  kind: ComputeWorkerKind;
  labels?: string[];
  latencyMs?: number;
  maxConcurrency: number;
  privacyClasses: string[];
  status: ComputeWorkerStatus;
  trustZone: "cloud_untrusted" | "local_private" | "team_private";
  usedConcurrency: number;
}

export interface ComputeTaskRequirements {
  allowRemote: boolean;
  estimatedMinutes?: number;
  maxCostUsd?: number;
  maxLatencyMs?: number;
  privacyClass: string;
  requiredCapabilities: string[];
}

export interface RejectedComputeWorker {
  estimatedCostUsd: number;
  id: string;
  kind: ComputeWorkerKind;
  reasons: string[];
}

export interface ComputePlacementPlan {
  estimatedCostUsd: number;
  localOnly: boolean;
  rejected: RejectedComputeWorker[];
  selected?: ComputeWorker;
  status: ComputePlacementStatus;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isLocal(worker: ComputeWorker) {
  return worker.kind === "local" || worker.trustZone === "local_private";
}

function estimateCost(worker: ComputeWorker, requirements: ComputeTaskRequirements) {
  return (worker.costPerMinuteUsd ?? 0) * (requirements.estimatedMinutes ?? 0);
}

function missingCapabilities(worker: ComputeWorker, requirements: ComputeTaskRequirements) {
  const workerCapabilities = new Set(worker.capabilities.map(normalize));
  return requirements.requiredCapabilities
    .map(normalize)
    .filter((capability) => !workerCapabilities.has(capability))
    .map((capability) => `missing_capability:${capability}`);
}

function privacyAllowed(worker: ComputeWorker, privacyClass: string) {
  return worker.privacyClasses.map(normalize).includes(normalize(privacyClass));
}

export function planComputePlacement(input: {
  requirements: ComputeTaskRequirements;
  workers: ComputeWorker[];
}): ComputePlacementPlan {
  const rejected: RejectedComputeWorker[] = [];
  const localOnly = !input.requirements.allowRemote || normalize(input.requirements.privacyClass) === "local_only";
  const viable = input.workers
    .map((worker) => {
      const reasons = missingCapabilities(worker, input.requirements);
      const estimatedCostUsd = estimateCost(worker, input.requirements);

      if (worker.status !== "healthy") {
        reasons.push(`worker_${worker.status}`);
      }
      if (worker.usedConcurrency >= worker.maxConcurrency) {
        reasons.push("concurrency_exhausted");
      }
      if (localOnly && !isLocal(worker)) {
        reasons.push("local_only_policy");
      }
      if (!privacyAllowed(worker, input.requirements.privacyClass)) {
        reasons.push(`privacy_class_not_allowed:${input.requirements.privacyClass}`);
      }
      if (
        typeof input.requirements.maxLatencyMs === "number" &&
        typeof worker.latencyMs === "number" &&
        worker.latencyMs > input.requirements.maxLatencyMs
      ) {
        reasons.push("latency_exceeds_limit");
      }
      if (typeof input.requirements.maxCostUsd === "number" && estimatedCostUsd > input.requirements.maxCostUsd) {
        reasons.push("estimated_cost_exceeds_limit");
      }

      if (reasons.length > 0) {
        rejected.push({
          estimatedCostUsd,
          id: worker.id,
          kind: worker.kind,
          reasons
        });
      }

      return {
        estimatedCostUsd,
        reasons,
        score: (isLocal(worker) ? 0 : 1) + estimatedCostUsd + (worker.latencyMs ?? 0) / 100_000,
        worker
      };
    })
    .filter((candidate) => candidate.reasons.length === 0)
    .sort((left, right) => left.score - right.score);

  const selected = viable.at(0);
  if (selected) {
    const remoteNeedsHumanApproval =
      !isLocal(selected.worker) && ["private_code", "sensitive_logs"].includes(normalize(input.requirements.privacyClass));

    return {
      estimatedCostUsd: selected.estimatedCostUsd,
      localOnly,
      rejected,
      selected: selected.worker,
      status: remoteNeedsHumanApproval ? "human_approval_required" : "selected"
    };
  }

  const hasRemoteBlockedByPolicy = rejected.some((item) => item.reasons.includes("local_only_policy"));

  return {
    estimatedCostUsd: Math.min(...rejected.map((item) => item.estimatedCostUsd), Number.POSITIVE_INFINITY),
    localOnly,
    rejected,
    status: hasRemoteBlockedByPolicy ? "human_approval_required" : "blocked"
  };
}
