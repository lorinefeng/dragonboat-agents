// @vitest-environment node
import { describe, expect, it } from "vitest";
import { learnCapabilitiesFromTrace } from "./traceLearning";
import type { DemoEvent } from "./types";

function event(seq: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-30T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_trace_learning",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

describe("trace learning", () => {
  it("learns model and agent preferences from gated evidence outcomes", () => {
    const report = learnCapabilitiesFromTrace({
      events: [
        event(1, "route.decision.recorded", "agent_codex", {
          agentId: "agent_visual",
          model: "kimi-k2.6",
          requiredCapabilities: ["vision", "browser_research"],
          taskId: "task_visual_1"
        }),
        event(2, "evidence.gate.checked", "workflow_supervisor", {
          agentId: "agent_visual",
          status: "reviewable",
          taskId: "task_visual_1",
          taskType: "browser_research"
        }),
        event(3, "route.decision.recorded", "agent_codex", {
          agentId: "agent_visual",
          model: "kimi-k2.6",
          requiredCapabilities: ["vision", "browser_research"],
          taskId: "task_visual_2"
        }),
        event(4, "evidence.gate.checked", "workflow_supervisor", {
          agentId: "agent_visual",
          status: "reviewable",
          taskId: "task_visual_2",
          taskType: "browser_research"
        }),
        event(5, "route.decision.recorded", "agent_codex", {
          agentId: "agent_docs",
          model: "glm-5.1",
          requiredCapabilities: ["research"],
          taskId: "task_docs_1"
        }),
        event(6, "evidence.gate.checked", "workflow_supervisor", {
          agentId: "agent_docs",
          status: "rejected",
          taskId: "task_docs_1",
          taskType: "research"
        }),
        event(7, "route.decision.recorded", "agent_codex", {
          agentId: "agent_docs",
          model: "glm-5.1",
          requiredCapabilities: ["research"],
          taskId: "task_docs_2"
        }),
        event(8, "evidence.gate.checked", "workflow_supervisor", {
          agentId: "agent_docs",
          status: "rejected",
          taskId: "task_docs_2",
          taskType: "research"
        })
      ],
      generatedAt: "2026-05-30T00:01:00Z",
      minimumAttempts: 2
    });

    expect(report.learned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "kimi-k2.6",
          recommendation: "prefer",
          successRate: 1
        }),
        expect.objectContaining({
          entityId: "glm-5.1",
          recommendation: "avoid",
          successRate: 0
        }),
        expect.objectContaining({
          entityId: "agent_visual",
          recommendation: "prefer"
        }),
        expect.objectContaining({
          entityId: "agent_docs",
          recommendation: "avoid"
        })
      ])
    );
  });
});
