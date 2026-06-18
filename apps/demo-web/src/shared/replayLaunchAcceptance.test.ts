// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DemoEvent } from "./types";
import { validateReplayLaunchAcceptance } from "./replayLaunchAcceptance";

function event(seq: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-24T09:${String(seq).padStart(2, "0")}:00.000Z`,
    id: `evt_${String(seq).padStart(4, "0")}`,
    payload,
    runId: "run_replay_launch",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

function launchEvents(overrides: DemoEvent[] = []) {
  const events = [
    event(1, "run.created", "agent_system", {
      language: "zh"
    }),
    event(2, "crew.member.registered", "agent_codex", {
      agentId: "agent_codex",
      platform: "codex_cli",
      role: "steerer",
      status: "steering"
    }),
    event(3, "task.packet.created", "agent_codex", {
      owner: "agent_frontend",
      role: "frontend",
      taskId: "task_frontend"
    }),
    event(4, "crew.member.registered", "agent_frontend", {
      agentId: "agent_frontend",
      platform: "claude_code_cli",
      role: "frontend",
      status: "running"
    }),
    event(5, "route.decision.recorded", "agent_codex", {
      agentId: "agent_frontend",
      effort: "max",
      model: "kimi-k2.6",
      reason: "frontend visual QA requires screenshot-capable routing",
      requiredCapabilities: ["vision", "text"],
      role: "frontend_design",
      source: "task_packet_route"
    }),
    event(6, "mailbox.message.sent", "agent_frontend", {
      body: "Frontend handoff ready for QA.",
      from: "agent_frontend",
      messageType: "status",
      taskId: "task_frontend",
      to: "agent_qa_ops"
    }),
    event(7, "evidence.submitted", "agent_frontend", {
      status: "passed",
      title: "Frontend evidence"
    }),
    event(8, "steerer.review.completed", "agent_codex", {
      status: "passed",
      title: "First crew loop accepted"
    })
  ];

  return events.filter((item) => !overrides.some((override) => override.id === item.id)).concat(overrides);
}

describe("replay launch acceptance", () => {
  it("accepts a launch replay event stream with route, mailbox, evidence, review, and MP4 evidence", () => {
    const report = validateReplayLaunchAcceptance(launchEvents(), {
      fileExists: () => true,
      videoPath: "/tmp/dragonboat-launch-replay.mp4"
    });

    expect(report.passed).toBe(true);
    expect(report.title).toBe("replay-launch");
    expect(report.checks.find((check) => check.id === "route.decision")).toMatchObject({
      label: "route decision recorded",
      passed: true
    });
    expect(report.checks.find((check) => check.id === "video.exists")).toMatchObject({
      label: "replay MP4 exists",
      passed: true
    });
  });

  it("rejects a launch replay without an explainable route decision", () => {
    const report = validateReplayLaunchAcceptance(
      launchEvents([
        event(5, "command.output", "agent_codex", {
          agentId: "agent_codex",
          line: "Codex is planning."
        })
      ])
    );

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "route.decision")).toMatchObject({
      passed: false
    });
  });
});
