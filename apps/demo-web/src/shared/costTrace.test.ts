// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createCostTrace } from "./costTrace";
import type { DemoEvent } from "./types";

function event(seq: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-30T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_cost",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

describe("cost trace and waste detector", () => {
  it("builds a cost flamegraph and flags rejected, refuted, and unused work", () => {
    const trace = createCostTrace([
      event(1, "workflow.phase.started", "workflow_supervisor", { phaseId: "phase_fanout", workflowId: "workflow_cost" }),
      event(2, "workflow.agent.spawned", "workflow_supervisor", {
        agentId: "agent_a",
        phaseId: "phase_fanout",
        taskId: "task_a",
        workflowId: "workflow_cost"
      }),
      event(3, "command.output", "agent_a", {
        agentId: "agent_a",
        estimatedCostUsd: 0.4,
        usage: { input_tokens: 10000, output_tokens: 1000 }
      }),
      event(4, "claim.reviewed", "agent_refuter", {
        claimId: "claim_a",
        finalSynthesisIncluded: true,
        sourceAgent: "agent_a",
        status: "supported"
      }),
      event(5, "workflow.agent.spawned", "workflow_supervisor", {
        agentId: "agent_b",
        phaseId: "phase_fanout",
        taskId: "task_b",
        workflowId: "workflow_cost"
      }),
      event(6, "command.output", "agent_b", {
        agentId: "agent_b",
        estimatedCostUsd: 0.3,
        usage: { input_tokens: 8000, output_tokens: 500 }
      }),
      event(7, "claim.reviewed", "agent_refuter", {
        claimId: "claim_b",
        finalSynthesisIncluded: false,
        sourceAgent: "agent_b",
        status: "refuted"
      }),
      event(8, "evidence.gate.checked", "workflow_supervisor", {
        agentId: "agent_b",
        status: "rejected",
        taskId: "task_b"
      })
    ]);

    expect(trace.totalEstimatedCostUsd).toBeCloseTo(0.7);
    expect(trace.wastedEstimatedCostUsd).toBeCloseTo(0.3);
    expect(trace.flamegraph.children[0]?.name).toBe("phase_fanout");
    expect(trace.wasteItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent_b",
          reason: "evidence_rejected"
        }),
        expect.objectContaining({
          agentId: "agent_b",
          reason: "refuted_claim"
        })
      ])
    );
  });
});
