// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSharedFactBoard, formatSharedFactBoardMarkdown } from "./sharedFactBoard";
import type { DemoEvent } from "./types";

function event(seq: number, type: DemoEvent["type"], actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-06-02T07:${String(seq).padStart(2, "0")}:00.000Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_fact_board",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

describe("shared fact board", () => {
  it("derives confirmed facts, unverified claims, conflicts, pending handoffs, missing evidence, and accepted conclusions", () => {
    const board = createSharedFactBoard({
      createdAt: "2026-06-02T08:00:00.000Z",
      events: [
        event(1, "claim.submitted", "agent_backend", {
          claim: "Root repository contains a workflow engine mainline.",
          claimId: "claim_root_mainline",
          confidence: "high",
          sources: ["AGENTS.md"],
          taskId: "task_backend"
        }),
        event(2, "claim.reviewed", "agent_qa", {
          claimId: "claim_root_mainline",
          note: "Supported by AGENTS.md and docs/product-features.md.",
          sources: ["docs/product-features.md"],
          status: "supported",
          verifierAgent: "agent_qa"
        }),
        event(3, "claim.submitted", "agent_surface", {
          claim: "Surface artifacts are fully accepted.",
          claimId: "claim_surface_done",
          sources: ["handoffs/surface.md"],
          taskId: "task_surface"
        }),
        event(4, "claim.reviewed", "agent_qa", {
          claimId: "claim_surface_done",
          note: "Evidence file is missing.",
          status: "refuted",
          verifierAgent: "agent_qa"
        }),
        event(5, "handoff.submitted", "agent_backend", {
          ackRequired: true,
          claims: ["Backend contract is ready for frontend consumption."],
          confidence: "high",
          from: "agent_backend",
          handoffId: "handoff_backend_frontend",
          openQuestions: ["Does frontend need raw debug fallback?"],
          recipient: "agent_frontend",
          requiredAction: "consume contract before UI work",
          sources: ["handoffs/backend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend"
        }),
        event(6, "evidence.gate.checked", "agent_codex", {
          agentId: "agent_surface",
          reasons: ["missing workspace proof"],
          status: "rejected",
          taskId: "task_surface"
        }),
        event(7, "evidence.gate.checked", "agent_codex", {
          agentId: "agent_backend",
          evidenceSeq: 6,
          status: "reviewable",
          taskId: "task_backend"
        }),
        event(8, "steerer.review.completed", "agent_codex", {
          summary: "Repository capability map accepted for synthesis.",
          status: "accepted",
          taskId: "task_backend"
        })
      ]
    });

    expect(board.schema_version).toBe("dragonboat.shared_fact_board.v0");
    expect(board.confirmed_facts).toEqual([
      expect.objectContaining({
        claimId: "claim_root_mainline",
        status: "supported",
        text: "Root repository contains a workflow engine mainline."
      })
    ]);
    expect(board.unverified_claims).toEqual([
      expect.objectContaining({
        claimId: "claim_surface_done",
        text: "Surface artifacts are fully accepted."
      })
    ]);
    expect(board.conflicting_claims).toEqual([
      expect.objectContaining({
        claimId: "claim_surface_done",
        status: "refuted"
      })
    ]);
    expect(board.pending_handoffs).toEqual([
      expect.objectContaining({
        handoffId: "handoff_backend_frontend",
        requiredAction: "consume contract before UI work"
      })
    ]);
    expect(board.missing_evidence).toEqual([
      expect.objectContaining({
        agentId: "agent_surface",
        taskId: "task_surface"
      })
    ]);
    expect(board.accepted_conclusions).toEqual([
      expect.objectContaining({
        text: "Repository capability map accepted for synthesis."
      })
    ]);
  });

  it("formats a one-screen board for the steerer", () => {
    const board = createSharedFactBoard({
      createdAt: "2026-06-02T08:00:00.000Z",
      events: [
        event(1, "claim.submitted", "agent_backend", {
          claim: "Mailbox traffic is durable.",
          claimId: "claim_mailbox",
          sources: [".dragonboat/runs/run_x/events.ndjson"]
        })
      ]
    });

    expect(formatSharedFactBoardMarkdown(board)).toContain("## Unverified Claims");
    expect(formatSharedFactBoardMarkdown(board)).toContain("Mailbox traffic is durable.");
  });

  it("projects legacy mailbox, evidence, and lifecycle events into consumable shared facts", () => {
    const board = createSharedFactBoard({
      createdAt: "2026-06-02T08:00:00.000Z",
      events: [
        event(1, "crew.member.registered", "agent_root_mainline_map", {
          agentId: "agent_root_mainline_map",
          platform: "claude_code_cli",
          role: "backend_review"
        }),
        event(2, "mailbox.message.sent", "agent_root_mainline_map", {
          body: "根仓主线地图已落盘，请 evidence 位交叉核验。",
          from: "agent_root_mainline_map",
          messageType: "review",
          sources: [".dragonboat/handoffs/agent_root_mainline_map.md"],
          taskId: "task_root_mainline_map",
          to: "agent_evidence_value_crosscheck"
        }),
        event(6, "mailbox.message.sent", "agent_codex", {
          body: "# Task Packet: this initial instruction should not become a pending handoff.",
          from: "agent_codex",
          messageType: "instruction",
          taskId: "task_root_mainline_map",
          to: "agent_root_mainline_map"
        }),
        event(3, "evidence.submitted", "agent_root_mainline_map", {
          evidenceFiles: [".dragonboat/evidence/agent_root_mainline_map.md"],
          status: "passed",
          summary: "根仓主线能力图谱完成，包含可解释工作流引擎定位。",
          taskId: "task_root_mainline_map",
          title: "Root mainline map evidence"
        }),
        event(4, "crew.member.status_changed", "agent_root_mainline_map", {
          agentId: "agent_root_mainline_map",
          status: "done"
        }),
        event(5, "crew.member.status_changed", "agent_surface_asset_ops", {
          agentId: "agent_surface_asset_ops",
          status: "done"
        })
      ]
    });

    expect(board.confirmed_facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent_root_mainline_map",
          sources: [".dragonboat/evidence/agent_root_mainline_map.md"],
          taskId: "task_root_mainline_map",
          text: "Evidence submitted by agent_root_mainline_map: 根仓主线能力图谱完成，包含可解释工作流引擎定位。"
        }),
        expect.objectContaining({
          agentId: "agent_root_mainline_map",
          text: "agent_root_mainline_map reached done state."
        })
      ])
    );
    expect(board.pending_handoffs).toEqual([
      expect.objectContaining({
        agentId: "agent_root_mainline_map",
        requiredAction: "agent_evidence_value_crosscheck should consume this mailbox message.",
        sources: [".dragonboat/handoffs/agent_root_mainline_map.md"],
        taskId: "task_root_mainline_map",
        text: "根仓主线地图已落盘，请 evidence 位交叉核验。"
      })
    ]);
    expect(board.missing_evidence).toEqual([
      expect.objectContaining({
        agentId: "agent_surface_asset_ops",
        text: "agent_surface_asset_ops is done but no evidence.submitted event was found."
      })
    ]);
  });
});
