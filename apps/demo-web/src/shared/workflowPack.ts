import type { WorkflowPhase, WorkflowPlan, WorkflowPhaseKind, WorkflowQualityPattern } from "./agenticWorkflow";

export interface RolePack {
  capabilities: string[];
  id: string;
  modelHint: "low_cost_text" | "premium_reasoning" | "vision";
  title: string;
}

export interface WorkflowPack {
  defaultPhases: WorkflowPhaseKind[];
  description: string;
  id: string;
  qualityPatterns: WorkflowQualityPattern[];
  roles: RolePack[];
  title: string;
}

const PACKS: WorkflowPack[] = [
  {
    defaultPhases: ["discover", "fanout", "cross_check", "synthesize", "verify"],
    description: "Parallel PR review with specialist reviewers and refuters.",
    id: "pr_review",
    qualityPatterns: ["map_reduce", "independent_verify", "refuter", "claim_vote"],
    roles: [
      { capabilities: ["text", "code_review"], id: "code_reviewer", modelHint: "low_cost_text", title: "Code Reviewer" },
      { capabilities: ["text", "test_review"], id: "test_reviewer", modelHint: "low_cost_text", title: "Test Reviewer" },
      { capabilities: ["text", "refuter"], id: "refuter", modelHint: "premium_reasoning", title: "Refuter" }
    ],
    title: "PR Review"
  },
  {
    defaultPhases: ["discover", "shard", "fanout", "cross_check", "synthesize", "verify"],
    description: "Large migration broken into file or module waves.",
    id: "large_migration",
    qualityPatterns: ["map_reduce", "independent_verify", "fix_loop"],
    roles: [
      { capabilities: ["text", "architecture"], id: "migration_planner", modelHint: "premium_reasoning", title: "Migration Planner" },
      { capabilities: ["text", "code"], id: "module_worker", modelHint: "low_cost_text", title: "Module Worker" },
      { capabilities: ["text", "test"], id: "test_verifier", modelHint: "low_cost_text", title: "Test Verifier" }
    ],
    title: "Large Migration"
  },
  {
    defaultPhases: ["discover", "fanout", "cross_check", "synthesize", "verify"],
    description: "Frontend multimodal workflow with screenshots and visual QA.",
    id: "frontend_multimodal",
    qualityPatterns: ["map_reduce", "independent_verify", "refuter"],
    roles: [
      { capabilities: ["vision", "browser_research"], id: "visual_designer", modelHint: "vision", title: "Visual Designer" },
      { capabilities: ["text", "frontend_code"], id: "frontend_builder", modelHint: "low_cost_text", title: "Frontend Builder" },
      { capabilities: ["vision", "ui_review"], id: "visual_qa", modelHint: "vision", title: "Visual QA" }
    ],
    title: "Frontend Multimodal"
  },
  {
    defaultPhases: ["discover", "fanout", "cross_check", "synthesize", "verify"],
    description: "Security audit workflow with adversarial review.",
    id: "security_audit",
    qualityPatterns: ["map_reduce", "independent_verify", "refuter", "claim_vote"],
    roles: [
      { capabilities: ["text", "security"], id: "auth_reviewer", modelHint: "premium_reasoning", title: "Auth Reviewer" },
      { capabilities: ["text", "data_flow"], id: "data_flow_reviewer", modelHint: "low_cost_text", title: "Data Flow Reviewer" },
      { capabilities: ["text", "refuter"], id: "refuter", modelHint: "premium_reasoning", title: "Refuter" }
    ],
    title: "Security Audit"
  }
];

const PHASE_TITLES: Record<WorkflowPhaseKind, string> = {
  cross_check: "Cross-check claims",
  discover: "Discover context",
  fanout: "Fan out rowers",
  shard: "Shard work",
  synthesize: "Synthesize report",
  verify: "Verify result"
};

export function listWorkflowPacks() {
  return PACKS;
}

export function getWorkflowPack(id: string) {
  return PACKS.find((pack) => pack.id === id);
}

function phaseFromPack(pack: WorkflowPack, kind: WorkflowPhaseKind): WorkflowPhase {
  const maxAgents = kind === "fanout" ? Math.min(4, Math.max(1, pack.roles.length)) : kind === "cross_check" ? 2 : 1;
  return {
    id: `phase_${kind}`,
    inputs: ["shared mission", "sealed task packets", "context bundle"],
    kind,
    max_agents: maxAgents,
    outputs: kind === "synthesize" ? ["claim-backed final report"] : ["sourced claims", "handoff", "evidence"],
    quality_patterns: kind === "cross_check" ? ["independent_verify", "refuter", "claim_vote"] : pack.qualityPatterns.slice(0, 1),
    routes: kind === "fanout" && pack.roles.some((role) => role.modelHint === "vision") ? ["text", "browser_research"] : ["text"],
    status: "pending",
    stop_condition: kind === "verify" ? "final artifact passes evidence gate" : "phase outputs are reviewable",
    title: PHASE_TITLES[kind]
  };
}

export function renderWorkflowPackPlan(
  id: string,
  input: {
    goal: string;
    workflowId?: string;
    workspaceRoot: string;
  }
): WorkflowPlan {
  const pack = getWorkflowPack(id);
  if (!pack) {
    throw new Error(`Unknown workflow pack: ${id}`);
  }

  return {
    approval_gates: ["human approves pack plan before run", "evidence gate passes before synthesis"],
    created_at: new Date().toISOString(),
    goal: input.goal,
    human_approval_required: false,
    limits: {
      max_concurrency: 4,
      max_total_agents: 24
    },
    phases: pack.defaultPhases.map((phase) => phaseFromPack(pack, phase)),
    quality_patterns: pack.qualityPatterns,
    schema_version: "dragonboat.workflow_plan.v0",
    workflow_id: input.workflowId ?? `workflow_${pack.id}`,
    workspace_root: input.workspaceRoot
  };
}
