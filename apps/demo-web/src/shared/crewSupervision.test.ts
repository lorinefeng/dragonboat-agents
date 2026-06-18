// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateCrewSupervision, formatCrewSupervisionReport } from "./crewSupervision";
import type { DemoEvent } from "./types";

function event(seq: number, type: string, actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-26T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_supervise",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type: type as DemoEvent["type"]
  };
}

describe("crew supervision", () => {
  it("marks agents complete only after intent confirmation, status, and evidence are all present", () => {
    const report = evaluateCrewSupervision({
      agents: ["agent_runtime_review", "agent_product_review"],
      events: [
        event(1, "mailbox.message.sent", "agent_runtime_review", {
          body: "我理解共同目标、我的运行时视角和不做范围。",
          from: "agent_runtime_review",
          messageType: "intent_confirmed",
          taskId: "task_runtime_review",
          to: "agent_codex"
        }),
        event(2, "mailbox.message.sent", "agent_runtime_review", {
          body: "第一轮运行时风险清单已形成。",
          from: "agent_runtime_review",
          messageType: "status",
          taskId: "task_runtime_review",
          to: "agent_codex"
        }),
        event(3, "evidence.submitted", "agent_runtime_review", {
          summary: "运行时 review 完成。",
          taskId: "task_runtime_review"
        }),
        event(4, "mailbox.message.sent", "agent_product_review", {
          body: "我理解共同目标、产品视角和不做范围。",
          from: "agent_product_review",
          messageType: "intent_confirmed",
          taskId: "task_product_review",
          to: "agent_codex"
        })
      ],
      expectations: ["intent_confirmed", "status", "evidence"]
    });

    expect(report.complete).toBe(false);
    expect(report.agents.agent_runtime_review.complete).toBe(true);
    expect(report.agents.agent_product_review.missing).toEqual(["status", "evidence"]);
    expect(formatCrewSupervisionReport(report)).toContain("waiting");
  });

  it("flags blockers separately from ordinary missing progress", () => {
    const report = evaluateCrewSupervision({
      agents: ["agent_qa_review"],
      events: [
        event(1, "mailbox.message.sent", "agent_qa_review", {
          body: "验收范围不明确。",
          from: "agent_qa_review",
          messageType: "blocker",
          taskId: "task_qa_review",
          to: "agent_codex"
        })
      ],
      expectations: ["intent_confirmed"]
    });

    expect(report.status).toBe("blocked");
    expect(report.agents.agent_qa_review.blocked).toBe(true);
  });
});
