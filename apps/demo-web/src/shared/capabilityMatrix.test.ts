// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildCapabilityMatrix } from "./capabilityMatrix";
import type { DemoEvent } from "./types";

function event(seq: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-30T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_capability",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

describe("capability matrix and agent skill cards", () => {
  it("updates model and agent capability profiles from route decisions, gates, claims, and blockers", () => {
    const matrix = buildCapabilityMatrix([
      event(1, "route.decision.recorded", "agent_codex", {
        agentId: "agent_visual",
        model: "kimi-k2.6",
        requiredCapabilities: ["vision", "browser_research"],
        taskId: "task_visual"
      }),
      event(2, "evidence.gate.checked", "workflow_supervisor", {
        agentId: "agent_visual",
        status: "reviewable",
        taskId: "task_visual",
        taskType: "browser_research"
      }),
      event(3, "claim.reviewed", "agent_refuter", {
        claimId: "claim_visual",
        sourceAgent: "agent_visual",
        status: "supported",
        taskId: "task_visual"
      }),
      event(4, "route.decision.recorded", "agent_codex", {
        agentId: "agent_docs",
        model: "glm-5.1",
        requiredCapabilities: ["text"],
        taskId: "task_docs"
      }),
      event(5, "evidence.gate.checked", "workflow_supervisor", {
        agentId: "agent_docs",
        status: "rejected",
        taskId: "task_docs",
        taskType: "research"
      })
    ]);

    expect(matrix.models["kimi-k2.6"]?.successRate).toBe(1);
    expect(matrix.models["kimi-k2.6"]?.capabilities).toEqual(expect.arrayContaining(["vision", "browser_research"]));
    expect(matrix.models["glm-5.1"]?.failureCount).toBe(1);
    expect(matrix.agents.agent_visual?.strengths).toEqual(expect.arrayContaining(["browser_research", "vision"]));
    expect(matrix.agents.agent_docs?.weaknesses).toEqual(expect.arrayContaining(["research"]));
  });
});
