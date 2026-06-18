import {
  assessDelegationFit,
  formatDelegationAssessmentMarkdown,
  type DelegationFitAssessment,
  type DelegationScores
} from "./delegationEconomics.ts";
import type { DemoEvent } from "./types.ts";

export type AgenticMode = "agent_team" | "dynamic_workflow" | "human_approval_required" | "single" | "subagent";

export type WorkflowPhaseKind = "cross_check" | "discover" | "fanout" | "shard" | "synthesize" | "verify";

export type WorkflowPhaseStatus = "blocked" | "completed" | "pending" | "skipped" | "started";

export type WorkflowQualityPattern = "claim_vote" | "fix_loop" | "independent_verify" | "map_reduce" | "refuter";

export type ClaimVerificationStatus = "conflicted" | "needs_human" | "refuted" | "supported" | "unverified";
export type WorkflowTruthStatus = "accepted" | "none" | "reviewable" | "submitted";

export interface AgenticTaskSignals {
  crossCheckRequired?: boolean;
  estimatedTokens?: number;
  expectedAgentCount?: number;
  hiddenComplexity?: boolean;
  maxConcurrency?: number;
  phaseCount?: number;
  requiresHumanApproval?: boolean;
}

export interface AgenticModeAssessment {
  delegation: DelegationFitAssessment;
  mode: AgenticMode;
  reasons: string[];
  schema_version: "dragonboat.agentic_mode.v0";
  signals: AgenticTaskSignals;
}

export interface WorkflowPhase {
  id: string;
  inputs: string[];
  kind: WorkflowPhaseKind;
  max_agents: number;
  outputs: string[];
  quality_patterns: WorkflowQualityPattern[];
  routes: string[];
  status: WorkflowPhaseStatus;
  stop_condition: string;
  title: string;
}

export interface WorkflowPlan {
  approval_gates: string[];
  created_at: string;
  goal: string;
  human_approval_required: boolean;
  limits: {
    cost_cap_usd?: number;
    max_concurrency: number;
    max_total_agents: number;
    token_cap?: number;
  };
  phases: WorkflowPhase[];
  quality_patterns: WorkflowQualityPattern[];
  schema_version: "dragonboat.workflow_plan.v0";
  workflow_id: string;
  workspace_root: string;
}

export interface WorkflowPlanValidation {
  errors: string[];
  valid: boolean;
}

export interface ClaimLedgerEntry {
  claim?: string;
  claimId: string;
  confidence?: "high" | "low" | "medium";
  finalSynthesisIncluded?: boolean;
  sourceAgent?: string;
  sources?: string[];
  status: ClaimVerificationStatus;
  updatedAt?: string;
  verifierAgent?: string;
}

export interface WorkflowProjectionSummary {
  activeAgentCount: number;
  activePhaseId?: string;
  blockedPhaseCount: number;
  claimCounts: Record<ClaimVerificationStatus, number>;
  mode: AgenticMode;
  phaseStatuses: Record<string, WorkflowPhaseStatus>;
  truthStatus: WorkflowTruthStatus;
}

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_TOTAL_AGENTS = 24;
const DEFAULT_TOKEN_APPROVAL_CAP = 200_000;

const DEFAULT_PHASES: Array<{
  kind: WorkflowPhaseKind;
  max_agents: number;
  quality_patterns: WorkflowQualityPattern[];
  routes: string[];
  stop_condition: string;
  title: string;
}> = [
  {
    kind: "discover",
    max_agents: 1,
    quality_patterns: ["map_reduce"],
    routes: ["text"],
    stop_condition: "core context bundle and open questions are written",
    title: "Discover shared context"
  },
  {
    kind: "shard",
    max_agents: 1,
    quality_patterns: ["map_reduce"],
    routes: ["text"],
    stop_condition: "work shards have sealed inputs and acceptance checks",
    title: "Shard the work"
  },
  {
    kind: "fanout",
    max_agents: 4,
    quality_patterns: ["map_reduce"],
    routes: ["text", "browser_research"],
    stop_condition: "all shard rowers submit sourced claims or blockers",
    title: "Fan out rowers"
  },
  {
    kind: "cross_check",
    max_agents: 2,
    quality_patterns: ["independent_verify", "refuter", "claim_vote"],
    routes: ["text", "browser_research"],
    stop_condition: "critical claims are supported, refuted, or marked unresolved",
    title: "Cross-check claims"
  },
  {
    kind: "synthesize",
    max_agents: 1,
    quality_patterns: ["claim_vote"],
    routes: ["text"],
    stop_condition: "synthesis cites supported claims and lists conflicts",
    title: "Synthesize"
  },
  {
    kind: "verify",
    max_agents: 1,
    quality_patterns: ["independent_verify", "fix_loop"],
    routes: ["text"],
    stop_condition: "final artifact passes evidence gate",
    title: "Verify final result"
  }
];

function reasonIf(condition: boolean, reason: string) {
  return condition ? [reason] : [];
}

export function assessAgenticMode(input: {
  hardBlockers?: string[];
  scores: DelegationScores;
  taskSignals?: AgenticTaskSignals;
}): AgenticModeAssessment {
  const hardBlockers = input.hardBlockers ?? [];
  const signals = input.taskSignals ?? {};
  const delegation = assessDelegationFit(input.scores, hardBlockers);
  const reasons: string[] = [
    ...hardBlockers.map((blocker) => `hard_blocker: ${blocker}`),
    ...reasonIf(Boolean(signals.hiddenComplexity), "task has hidden complexity"),
    ...reasonIf(Boolean(signals.crossCheckRequired), "task requires cross-checking"),
    ...reasonIf((signals.expectedAgentCount ?? 0) > 5, "expected agent count exceeds simple team size"),
    ...reasonIf((signals.phaseCount ?? 0) >= 3, "task needs multiple workflow phases")
  ];

  let mode: AgenticMode;

  if (
    signals.requiresHumanApproval ||
    (signals.expectedAgentCount ?? 0) > DEFAULT_MAX_TOTAL_AGENTS ||
    (signals.maxConcurrency ?? 0) > DEFAULT_MAX_CONCURRENCY ||
    (signals.estimatedTokens ?? 0) > DEFAULT_TOKEN_APPROVAL_CAP
  ) {
    mode = "human_approval_required";
    if ((signals.expectedAgentCount ?? 0) > DEFAULT_MAX_TOTAL_AGENTS) {
      reasons.push("expected agents exceed default cap");
    }
    if ((signals.maxConcurrency ?? 0) > DEFAULT_MAX_CONCURRENCY) {
      reasons.push("max concurrency exceeds default cap");
    }
    if ((signals.estimatedTokens ?? 0) > DEFAULT_TOKEN_APPROVAL_CAP) {
      reasons.push("estimated tokens exceed default cap");
    }
  } else if (hardBlockers.length > 0 || delegation.decision === "single_agent_default") {
    mode = "single";
    if (hardBlockers.length === 0) {
      reasons.push("delegation fit score defaults to single agent");
    }
  } else if (
    delegation.decision === "crew_strong_fit" &&
    ((signals.expectedAgentCount ?? 0) > 5 ||
      (signals.phaseCount ?? 0) >= 3 ||
      Boolean(signals.crossCheckRequired) ||
      Boolean(signals.hiddenComplexity))
  ) {
    mode = "dynamic_workflow";
    reasons.push("large phased cross-checkable task");
  } else if (delegation.decision === "crew_strong_fit" || (signals.expectedAgentCount ?? 0) >= 3) {
    mode = "agent_team";
    reasons.push("bounded multi-rower crew is appropriate");
  } else {
    mode = "subagent";
    reasons.push("single isolated helper can reduce context load");
  }

  return {
    delegation,
    mode,
    reasons,
    schema_version: "dragonboat.agentic_mode.v0",
    signals
  };
}

export function formatAgenticModeAssessmentMarkdown(assessment: AgenticModeAssessment) {
  return [
    "# Agentic Mode Assessment",
    "",
    `- Mode: \`${assessment.mode}\``,
    `- Delegation decision: \`${assessment.delegation.decision}\``,
    `- Fit score: \`${assessment.delegation.fit_score}\``,
    "",
    "## Reasons",
    "",
    ...(assessment.reasons.length > 0 ? assessment.reasons.map((reason) => `- ${reason}`) : ["- none"]),
    "",
    "## Delegation Detail",
    "",
    formatDelegationAssessmentMarkdown(assessment.delegation).trim(),
    ""
  ].join("\n");
}

function workflowIdFromGoal(goal: string) {
  const slug =
    goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workflow";
  return `workflow_${slug}`;
}

export function createWorkflowPlan(input: {
  costCapUsd?: number;
  createdAt?: string;
  goal: string;
  humanApprovalRequired?: boolean;
  limits?: {
    max_concurrency?: number;
    max_total_agents?: number;
  };
  maxConcurrency?: number;
  maxTotalAgents?: number;
  phaseKinds?: WorkflowPhaseKind[];
  tokenCap?: number;
  workflowId?: string;
  workspaceRoot: string;
}): WorkflowPlan {
  const selectedKinds = input.phaseKinds ?? DEFAULT_PHASES.map((phase) => phase.kind);
  const maxConcurrency = input.maxConcurrency ?? input.limits?.max_concurrency ?? DEFAULT_MAX_CONCURRENCY;
  const maxTotalAgents = input.maxTotalAgents ?? input.limits?.max_total_agents ?? DEFAULT_MAX_TOTAL_AGENTS;
  const phases = selectedKinds.map((kind, index) => {
    const template = DEFAULT_PHASES.find((phase) => phase.kind === kind) ?? DEFAULT_PHASES[index % DEFAULT_PHASES.length];
    return {
      id: `phase_${kind}`,
      inputs: index === 0 ? ["workspace context", "user objective"] : [`phase_${selectedKinds[index - 1]} outputs`],
      kind,
      max_agents: Math.min(template.max_agents, maxConcurrency),
      outputs: [`${kind} artifact`, `${kind} claims`],
      quality_patterns: template.quality_patterns,
      routes: template.routes,
      status: "pending" as const,
      stop_condition: template.stop_condition,
      title: template.title
    };
  });

  return {
    approval_gates: ["before fanout if limits exceed defaults", "before synthesis if conflicts remain"],
    created_at: input.createdAt ?? new Date().toISOString(),
    goal: input.goal,
    human_approval_required: input.humanApprovalRequired ?? false,
    limits: {
      ...(typeof input.costCapUsd === "number" ? { cost_cap_usd: input.costCapUsd } : {}),
      max_concurrency: maxConcurrency,
      max_total_agents: maxTotalAgents,
      ...(typeof input.tokenCap === "number" ? { token_cap: input.tokenCap } : {})
    },
    phases,
    quality_patterns: ["map_reduce", "independent_verify", "refuter", "claim_vote"],
    schema_version: "dragonboat.workflow_plan.v0",
    workflow_id: input.workflowId ?? workflowIdFromGoal(input.goal),
    workspace_root: input.workspaceRoot
  };
}

export function validateWorkflowPlan(plan: WorkflowPlan): WorkflowPlanValidation {
  const errors: string[] = [];

  if (plan.schema_version !== "dragonboat.workflow_plan.v0") {
    errors.push("schema_version must be dragonboat.workflow_plan.v0");
  }
  if (!plan.workflow_id?.trim()) {
    errors.push("workflow_id is required");
  }
  if (!plan.goal?.trim()) {
    errors.push("goal is required");
  }
  if (!plan.workspace_root?.trim()) {
    errors.push("workspace_root is required");
  }
  if (!Array.isArray(plan.phases) || plan.phases.length === 0) {
    errors.push("phases must include at least one phase");
  }
  if (!plan.human_approval_required && plan.limits.max_concurrency > DEFAULT_MAX_CONCURRENCY) {
    errors.push(`max_concurrency exceeds ${DEFAULT_MAX_CONCURRENCY} without human approval`);
  }
  if (!plan.human_approval_required && plan.limits.max_total_agents > DEFAULT_MAX_TOTAL_AGENTS) {
    errors.push(`max_total_agents exceeds ${DEFAULT_MAX_TOTAL_AGENTS} without human approval`);
  }

  for (const phase of plan.phases ?? []) {
    if (!phase.id?.trim()) {
      errors.push("phase id is required");
    }
    if (!phase.kind) {
      errors.push(`phase ${phase.id || "<unknown>"} kind is required`);
    }
    if (phase.max_agents > plan.limits.max_concurrency) {
      errors.push(`phase ${phase.id} max_agents exceeds workflow max_concurrency`);
    }
  }

  return {
    errors,
    valid: errors.length === 0
  };
}

export function parseWorkflowPlan(value: unknown): WorkflowPlan {
  if (!value || typeof value !== "object") {
    throw new Error("Workflow plan must be a JSON object.");
  }

  const plan = value as WorkflowPlan;
  const validation = validateWorkflowPlan({
    ...plan,
    approval_gates: Array.isArray(plan.approval_gates) ? plan.approval_gates : [],
    phases: Array.isArray(plan.phases) ? plan.phases : [],
    quality_patterns: Array.isArray(plan.quality_patterns) ? plan.quality_patterns : []
  });
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }
  return plan;
}

export function formatWorkflowPlanMarkdown(plan: WorkflowPlan) {
  const lines = [
    "# DragonBoat Workflow Plan",
    "",
    `- Workflow: \`${plan.workflow_id}\``,
    `- Goal: ${plan.goal}`,
    `- Workspace: \`${plan.workspace_root}\``,
    `- Max concurrency: \`${plan.limits.max_concurrency}\``,
    `- Max total agents: \`${plan.limits.max_total_agents}\``,
    `- Human approval required: \`${plan.human_approval_required ? "yes" : "no"}\``,
    "",
    "## Phases",
    ""
  ];

  for (const phase of plan.phases) {
    lines.push(
      `### ${phase.id}`,
      "",
      `- Kind: \`${phase.kind}\``,
      `- Max agents: \`${phase.max_agents}\``,
      `- Routes: ${phase.routes.map((route) => `\`${route}\``).join(", ") || "none"}`,
      `- Quality: ${phase.quality_patterns.map((pattern) => `\`${pattern}\``).join(", ") || "none"}`,
      `- Stop condition: ${phase.stop_condition}`,
      ""
    );
  }

  lines.push("## Quality Patterns", "", ...plan.quality_patterns.map((pattern) => `- \`${pattern}\``), "");
  return `${lines.join("\n")}\n`;
}

function mergeClaimStatus(current: ClaimVerificationStatus, next: ClaimVerificationStatus) {
  if (current === next || next === "unverified") {
    return current;
  }
  if (current === "unverified") {
    return next;
  }
  if ((current === "supported" && next === "refuted") || (current === "refuted" && next === "supported")) {
    return "conflicted";
  }
  if (next === "conflicted" || current === "conflicted") {
    return "conflicted";
  }
  return next;
}

export function updateClaimLedger(existing: ClaimLedgerEntry[], updates: ClaimLedgerEntry[]) {
  const byId = new Map(existing.map((entry) => [entry.claimId, { ...entry, sources: [...(entry.sources ?? [])] }]));

  for (const update of updates) {
    const current = byId.get(update.claimId);
    if (!current) {
      byId.set(update.claimId, {
        ...update,
        sources: [...new Set(update.sources ?? [])]
      });
      continue;
    }

    const updateSources = update.sources ?? [];
    byId.set(update.claimId, {
      ...current,
      ...update,
      claim: update.claim || current.claim,
      finalSynthesisIncluded: update.finalSynthesisIncluded ?? current.finalSynthesisIncluded,
      sources: [...new Set([...(current.sources ?? []), ...updateSources])],
      status: mergeClaimStatus(current.status, update.status)
    });
  }

  return [...byId.values()];
}

function eventPayloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function claimStatusFromEvent(event: DemoEvent): ClaimVerificationStatus {
  const status = eventPayloadString(event, "status");
  if (status === "supported" || status === "refuted" || status === "conflicted" || status === "needs_human") {
    return status;
  }
  return "unverified";
}

export function summarizeWorkflowEvents(events: DemoEvent[]): WorkflowProjectionSummary {
  const phaseStatuses: Record<string, WorkflowPhaseStatus> = {};
  const claimCounts: Record<ClaimVerificationStatus, number> = {
    conflicted: 0,
    needs_human: 0,
    refuted: 0,
    supported: 0,
    unverified: 0
  };
  const activeAgents = new Set<string>();
  let mode: AgenticMode = "single";
  let activePhaseId: string | undefined;
  let truthStatus: WorkflowTruthStatus = "none";

  for (const event of events) {
    if (event.type === "agentic.mode.selected") {
      const nextMode = eventPayloadString(event, "mode");
      if (
        nextMode === "single" ||
        nextMode === "subagent" ||
        nextMode === "agent_team" ||
        nextMode === "dynamic_workflow" ||
        nextMode === "human_approval_required"
      ) {
        mode = nextMode;
      }
    }

    if (event.type === "workflow.phase.started" || event.type === "workflow.phase.completed") {
      const phaseId = eventPayloadString(event, "phaseId") || eventPayloadString(event, "phase_id");
      if (phaseId) {
        const status = event.type === "workflow.phase.started" ? "started" : "completed";
        phaseStatuses[phaseId] = status;
        if (status === "started") {
          activePhaseId = phaseId;
        }
      }
    }

    if (event.type === "workflow.supervision.blocked") {
      const phaseId = eventPayloadString(event, "phaseId") || eventPayloadString(event, "phase_id");
      if (phaseId) {
        phaseStatuses[phaseId] = "blocked";
        activePhaseId = phaseId;
      }
    }

    if (event.type === "workflow.agent.spawned") {
      const agentId = eventPayloadString(event, "agentId") || event.actor;
      if (agentId) {
        activeAgents.add(agentId);
      }
    }

    if (event.type === "workflow.agent.stopped") {
      const agentId = eventPayloadString(event, "agentId") || event.actor;
      activeAgents.delete(agentId);
    }

    if (event.type === "claim.submitted" || event.type === "claim.reviewed") {
      claimCounts[claimStatusFromEvent(event)] += 1;
    }

    if (event.type === "evidence.submitted" && truthStatus === "none") {
      truthStatus = "submitted";
    }

    if (event.type === "evidence.gate.checked" && eventPayloadString(event, "status") === "reviewable" && truthStatus !== "accepted") {
      truthStatus = "reviewable";
    }

    if (
      (event.type === "workflow.acceptance.completed" || event.type === "steerer.review.completed") &&
      eventPayloadString(event, "status") === "accepted"
    ) {
      truthStatus = "accepted";
    }
  }

  return {
    activeAgentCount: activeAgents.size,
    ...(activePhaseId ? { activePhaseId } : {}),
    blockedPhaseCount: Object.values(phaseStatuses).filter((status) => status === "blocked").length,
    claimCounts,
    mode,
    phaseStatuses,
    truthStatus
  };
}
