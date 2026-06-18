// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assessAgenticMode,
  createWorkflowPlan,
  formatWorkflowPlanMarkdown,
  summarizeWorkflowEvents,
  updateClaimLedger,
  validateWorkflowPlan
} from "./agenticWorkflow";
import type { DemoEvent } from "./types";

const baseScores = {
  context_amortization: 3,
  parallel_split: 3,
  interface_stability: 3,
  acceptance_executability: 3,
  low_cost_rower_fit: 3,
  shared_state_penalty: 0,
  runtime_drift_penalty: 1
};

describe("agentic workflow readiness", () => {
  it("keeps tiny shared-state UI fixes in single mode", () => {
    const assessment = assessAgenticMode({
      scores: {
        ...baseScores,
        context_amortization: 1,
        parallel_split: 0,
        interface_stability: 1,
        acceptance_executability: 1,
        low_cost_rower_fit: 1,
        shared_state_penalty: 3,
        runtime_drift_penalty: 3
      },
      hardBlockers: ["tiny_ui_state_fix"]
    });

    expect(assessment.mode).toBe("single");
    expect(assessment.delegation.decision).toBe("single_agent_default");
    expect(assessment.reasons).toContain("hard_blocker: tiny_ui_state_fix");
  });

  it("routes large cross-checkable audits to dynamic workflow", () => {
    const assessment = assessAgenticMode({
      scores: baseScores,
      taskSignals: {
        crossCheckRequired: true,
        expectedAgentCount: 8,
        hiddenComplexity: true,
        phaseCount: 4
      }
    });

    expect(assessment.mode).toBe("dynamic_workflow");
    expect(assessment.reasons).toContain("large phased cross-checkable task");
  });

  it("requires human approval when workflow caps are exceeded", () => {
    const assessment = assessAgenticMode({
      scores: baseScores,
      taskSignals: {
        crossCheckRequired: true,
        expectedAgentCount: 40,
        phaseCount: 5
      }
    });

    expect(assessment.mode).toBe("human_approval_required");
    expect(assessment.reasons).toContain("expected agents exceed default cap");
  });

  it("creates a conservative provider-neutral workflow plan", () => {
    const plan = createWorkflowPlan({
      goal: "Audit DragonBoat message/evidence/ledger consistency.",
      workspaceRoot: "/repo"
    });

    expect(plan.schema_version).toBe("dragonboat.workflow_plan.v0");
    expect(plan.limits.max_concurrency).toBe(4);
    expect(plan.limits.max_total_agents).toBe(24);
    expect(plan.phases.map((phase) => phase.kind)).toEqual([
      "discover",
      "shard",
      "fanout",
      "cross_check",
      "synthesize",
      "verify"
    ]);
    expect(validateWorkflowPlan(plan).valid).toBe(true);
    expect(formatWorkflowPlanMarkdown(plan)).toContain("## Phases");
  });

  it("rejects workflow plans that exceed default agent caps without approval", () => {
    const plan = createWorkflowPlan({
      goal: "Oversized workflow",
      limits: {
        max_concurrency: 12,
        max_total_agents: 48
      },
      workspaceRoot: "/repo"
    });

    expect(validateWorkflowPlan(plan).valid).toBe(false);
    expect(validateWorkflowPlan(plan).errors).toContain("max_concurrency exceeds 4 without human approval");
    expect(validateWorkflowPlan(plan).errors).toContain("max_total_agents exceeds 24 without human approval");
  });

  it("tracks claim support, refutation, conflicts, and synthesis inclusion", () => {
    const ledger = updateClaimLedger(
      [],
      [
        {
          claimId: "claim_1",
          claim: "WebSearch is unreliable in this rower environment.",
          confidence: "medium",
          sourceAgent: "agent_runtime_review",
          sources: ["handoffs/runtime.md"],
          status: "unverified"
        },
        {
          claimId: "claim_1",
          verifierAgent: "agent_refuter",
          status: "supported"
        },
        {
          claimId: "claim_2",
          claim: "All evidence files were reflected in the ledger.",
          confidence: "low",
          finalSynthesisIncluded: true,
          sourceAgent: "agent_product_review",
          sources: ["events.ndjson"],
          status: "refuted"
        }
      ]
    );

    expect(ledger).toMatchObject([
      {
        claimId: "claim_1",
        status: "supported",
        verifierAgent: "agent_refuter"
      },
      {
        claimId: "claim_2",
        finalSynthesisIncluded: true,
        status: "refuted"
      }
    ]);
  });

  it("summarizes workflow events for the command deck", () => {
    const events: DemoEvent[] = [
      {
        actor: "agent_codex",
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "evt_1",
        payload: { mode: "dynamic_workflow" },
        runId: "run_1",
        seq: 1,
        type: "agentic.mode.selected"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-30T00:00:01.000Z",
        id: "evt_2",
        payload: { phaseId: "phase_fanout", status: "started" },
        runId: "run_1",
        seq: 2,
        type: "workflow.phase.started"
      },
      {
        actor: "agent_runtime",
        createdAt: "2026-05-30T00:00:02.000Z",
        id: "evt_3",
        payload: { claimId: "claim_1", status: "supported" },
        runId: "run_1",
        seq: 3,
        type: "claim.reviewed"
      }
    ];

    expect(summarizeWorkflowEvents(events)).toMatchObject({
      activePhaseId: "phase_fanout",
      claimCounts: {
        supported: 1
      },
      mode: "dynamic_workflow"
    });
  });
});
