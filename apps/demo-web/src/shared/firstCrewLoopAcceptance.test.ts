// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DemoEvent } from "./types";
import { validateFirstCrewLoopAcceptance } from "./firstCrewLoopAcceptance";

function event(index: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-22T00:00:${String(index).padStart(2, "0")}Z`,
    id: `evt_${index}`,
    payload,
    runId: "run_acceptance",
    seq: index,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

function passingEvents(overrides: DemoEvent[] = []): DemoEvent[] {
  const events = [
    event(1, "crew.member.registered", "agent_codex", {
      agentId: "agent_codex",
      platform: "codex_cli"
    }),
    event(2, "crew.member.registered", "agent_backend", {
      agentId: "agent_backend",
      platform: "claude_code_cli"
    }),
    event(3, "task.packet.created", "agent_codex", {
      owner: "agent_backend",
      taskId: "task_backend"
    }),
    event(4, "command.started", "agent_backend", {
      agentId: "agent_backend",
      command: "claude"
    }),
    event(5, "mailbox.message.sent", "agent_backend", {
      body: "Backend contract is ready.",
      from: "agent_backend",
      messageType: "contract",
      taskId: "task_backend",
      to: "agent_frontend"
    }),
    event(6, "evidence.submitted", "agent_backend", {
      status: "passed",
      taskId: "task_backend"
    },),
    event(7, "crew.member.registered", "agent_frontend", {
      agentId: "agent_frontend",
      platform: "claude_code_cli"
    }),
    event(8, "task.packet.created", "agent_codex", {
      owner: "agent_frontend",
      taskId: "task_frontend"
    }),
    event(9, "command.started", "agent_frontend", {
      agentId: "agent_frontend",
      command: "claude"
    }),
    event(10, "mailbox.message.sent", "agent_frontend", {
      body: "Frontend status is ready for QA.",
      from: "agent_frontend",
      messageType: "status",
      taskId: "task_frontend",
      to: "agent_qa_ops"
    }),
    event(11, "evidence.submitted", "agent_frontend", {
      status: "passed",
      taskId: "task_frontend"
    }),
    event(12, "crew.member.registered", "agent_qa_ops", {
      agentId: "agent_qa_ops",
      platform: "claude_code_cli"
    }),
    event(13, "task.packet.created", "agent_codex", {
      owner: "agent_qa_ops",
      taskId: "task_qa_ops"
    }),
    event(14, "command.started", "agent_qa_ops", {
      agentId: "agent_qa_ops",
      command: "claude"
    }),
    event(15, "mailbox.message.sent", "agent_qa_ops", {
      body: "QA evidence is ready for steerer review.",
      from: "agent_qa_ops",
      messageType: "evidence",
      taskId: "task_qa_ops",
      to: "agent_codex"
    }),
    event(16, "evidence.submitted", "agent_qa_ops", {
      status: "passed",
      taskId: "task_qa_ops"
    }),
    event(17, "evidence.gate.checked", "agent_codex", {
      agentId: "agent_backend",
      status: "reviewable",
      taskId: "task_backend"
    }),
    event(18, "evidence.gate.checked", "agent_codex", {
      agentId: "agent_frontend",
      status: "reviewable",
      taskId: "task_frontend"
    }),
    event(19, "evidence.gate.checked", "agent_codex", {
      agentId: "agent_qa_ops",
      status: "reviewable",
      taskId: "task_qa_ops"
    }),
    event(20, "crew.member.status_changed", "agent_codex", {
      agentId: "agent_backend",
      status: "stopped"
    })
  ];

  return events.map((item) => overrides.find((override) => override.id === item.id) ?? item);
}

describe("first crew-loop acceptance", () => {
  it("accepts a full dynamic backend frontend qa crew loop with lifecycle stop", () => {
    const report = validateFirstCrewLoopAcceptance(passingEvents());

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(18);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects empty required mailbox handoffs", () => {
    const report = validateFirstCrewLoopAcceptance(
      passingEvents([
        event(5, "mailbox.message.sent", "agent_backend", {
          body: "   ",
          from: "agent_backend",
          messageType: "contract",
          taskId: "task_backend",
          to: "agent_frontend"
        })
      ])
    );

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "mailbox.backend_frontend")).toMatchObject({
      passed: false
    });
  });

  it("rejects evidence that has not passed the evidence gate", () => {
    const report = validateFirstCrewLoopAcceptance(
      passingEvents([
        event(17, "evidence.gate.checked", "agent_codex", {
          agentId: "agent_backend",
          status: "rejected",
          taskId: "task_backend"
        })
      ])
    );

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "evidence.backend.reviewable")).toMatchObject({
      passed: false
    });
  });
});
