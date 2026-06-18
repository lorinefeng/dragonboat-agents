import { describe, expect, it } from "vitest";
import type { DemoEvent } from "../shared/types";
import { buildReplayTimeline } from "./replayData";

function event(seq: number, type: DemoEvent["type"], payload: DemoEvent["payload"] = {}, actor = "agent_codex"): DemoEvent {
  return {
    id: `evt_${String(seq).padStart(4, "0")}`,
    seq,
    runId: "run_demo_web_loop",
    type,
    actor,
    createdAt: "2026-05-19T10:00:00.000Z",
    payload
  };
}

describe("replay data", () => {
  it("keeps agent communication text while filtering command noise", () => {
    const timeline = buildReplayTimeline([
      event(1, "mailbox.message.sent", {
        from: "agent_codex",
        to: "agent_backend",
        messageType: "status",
        body: "Build the backend contract and tell frontend what changed."
      }),
      event(2, "command.output", {
        agentId: "agent_codex",
        line: "$ codex exec --profile steerer fullstack-case"
      }),
      event(3, "command.output", {
        agentId: "agent_codex",
        line: "Codex split the work into auth, boards, drag-sort, and QA lanes."
      }),
      event(
        4,
        "evidence.submitted",
        {
          title: "QA checks passed",
          status: "passed"
        },
        "agent_qa_ops"
      )
    ]);

    expect(timeline.messages.map((message) => message.body)).toEqual([
      "Build the backend contract and tell frontend what changed.",
      "Codex split the work into auth, boards, drag-sort, and QA lanes.",
      "证据提交：QA checks passed / passed"
    ]);
    expect(timeline.messages.map((message) => message.body)).not.toContain(
      "$ codex exec --profile steerer fullstack-case"
    );
    expect(timeline.messages.at(-1)).toMatchObject({
      from: "agent_qa_ops",
      narration: "QA/Ops 向主 Agent 提交证据：QA checks passed / passed",
      to: "agent_codex"
    });
  });

  it("adds Chinese stage narration for mailbox handoffs", () => {
    const timeline = buildReplayTimeline([
      event(1, "mailbox.message.sent", {
        from: "agent_backend",
        to: "agent_frontend",
        messageType: "contract",
        body:
          "Diff handoff handoffs/agent_backend_to_agent_frontend_api.diff: API ready: POST /api/auth/register, POST /api/auth/login."
      }),
      event(2, "mailbox.message.sent", {
        from: "agent_frontend",
        to: "agent_backend",
        messageType: "question",
        body:
          "Diff handoff handoffs/agent_frontend_to_agent_backend_question.diff: For card reorder, should cross-list movement call POST /api/cards/reorder?"
      })
    ]);

    expect(timeline.messages.map((message) => message.phaseTitle)).toEqual(["接口契约交接", "协议确认"]);
    expect(timeline.messages.map((message) => message.narration)).toEqual([
      "后端完成注册、登录和看板 API 契约，把接口说明和 diff 交给前端。",
      "前端没有猜测拖拽排序协议，而是把问题和相关 diff 反向发给后端确认。"
    ]);
  });

  it("builds a launch narrative that explains crew coordination instead of agent wrapping", () => {
    const timeline = buildReplayTimeline([
      event(1, "crew.member.registered", {
        agentId: "agent_codex",
        role: "steerer",
        status: "steering"
      }),
      event(2, "task.packet.created", {
        owner: "agent_frontend",
        role: "frontend",
        title: "Frontend task"
      }),
      event(3, "crew.member.registered", {
        agentId: "agent_frontend",
        role: "frontend",
        status: "running"
      }),
      event(4, "route.decision.recorded", {
        agentId: "agent_frontend",
        effort: "max",
        model: "kimi-k2.6",
        reason: "frontend visual QA requires screenshot-capable routing",
        requiredCapabilities: ["vision", "text"],
        role: "frontend_design",
        source: "task_packet_route"
      }),
      event(5, "mailbox.message.sent", {
        from: "agent_frontend",
        to: "agent_qa_ops",
        messageType: "status",
        body: "Frontend handoff ready for QA."
      }),
      event(6, "evidence.submitted", {
        status: "passed",
        title: "Frontend evidence"
      }, "agent_frontend"),
      event(7, "steerer.review.completed", {
        status: "passed",
        title: "First crew loop accepted"
      })
    ]);

    expect(timeline.positioning).toBe("DragonBoat is a crew coordination layer, not an agent wrapper.");
    expect(timeline.launchChapters.map((chapter) => chapter.id)).toEqual([
      "steerer",
      "dynamic-rowers",
      "model-routing",
      "mailbox",
      "evidence",
      "acceptance"
    ]);
    expect(timeline.messages).toContainEqual(
      expect.objectContaining({
        body: "agent_frontend: kimi-k2.6 / max / frontend visual QA requires screenshot-capable routing",
        kind: "route",
        labelZh: "模型路由",
        phaseTitle: "模型路由决策"
      })
    );
  });
});
