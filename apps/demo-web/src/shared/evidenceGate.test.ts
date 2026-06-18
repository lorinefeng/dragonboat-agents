// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateEvidenceGate } from "./evidenceGate";
import type { DemoEvent } from "./types";

function event(seq: number, type: string, actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-26T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_gate",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type: type as DemoEvent["type"]
  };
}

describe("evidence gate", () => {
  it("marks general evidence reviewable when mailbox, proof, workspace visibility, and risk disclosure exist", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_backend",
      events: [
        event(1, "mailbox.message.sent", "agent_backend", {
          body: "Backend contract handoff ready.",
          from: "agent_backend",
          messageType: "contract",
          taskId: "task_backend",
          to: "agent_frontend"
        }),
        event(2, "evidence.submitted", "agent_backend", {
          commandsRun: ["npm run demo:test"],
          remainingRisks: ["none"],
          summary: "Backend slice passed.",
          taskId: "task_backend",
          touchedFiles: ["apps/demo-web/src/shared/delegationEconomics.ts"],
          workspaceProof: "git status --short shows tracked workspace file"
        })
      ],
      taskId: "task_backend",
      taskType: "general"
    });

    expect(report.reviewable).toBe(true);
    expect(report.status).toBe("reviewable");
  });

  it("rejects evidence that lacks a durable mailbox before evidence", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_frontend",
      events: [
        event(2, "evidence.submitted", "agent_frontend", {
          commandsRun: ["npm run demo:test"],
          remainingRisks: ["none"],
          summary: "UI slice passed.",
          taskId: "task_frontend",
          touchedFiles: ["apps/demo-web/src/App.tsx"],
          workspaceProof: "main workspace checked"
        })
      ],
      taskId: "task_frontend",
      taskType: "general"
    });

    expect(report.reviewable).toBe(false);
    expect(report.checks.find((check) => check.id === "mailbox_before_evidence")).toMatchObject({
      passed: false
    });
  });

  it("recognizes event-ledger records that use agentId instead of actor", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_frontend",
      events: [
        {
          agentId: "agent_frontend",
          createdAt: "2026-05-26T00:00:02Z",
          id: "evt_raw",
          payload: {
            summary: "done",
            taskId: "task_frontend"
          },
          runId: "run_gate",
          seq: 2,
          type: "evidence.submitted"
        } as unknown as DemoEvent
      ],
      taskId: "task_frontend",
      taskType: "ui"
    });

    expect(report.evidenceSeq).toBe(2);
    expect(report.checks.find((check) => check.id === "evidence_present")).toMatchObject({
      passed: true
    });
  });

  it("requires screenshot evidence for UI/UX tasks", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_frontend",
      events: [
        event(1, "mailbox.message.sent", "agent_frontend", {
          body: "Frontend handoff ready.",
          from: "agent_frontend",
          messageType: "status",
          taskId: "task_frontend",
          to: "agent_qa_ops"
        }),
        event(2, "evidence.submitted", "agent_frontend", {
          commandsRun: ["npm run demo:test"],
          remainingRisks: ["none"],
          summary: "UI slice passed.",
          taskId: "task_frontend",
          touchedFiles: ["apps/demo-web/src/App.tsx"],
          workspaceProof: "main workspace checked"
        })
      ],
      taskId: "task_frontend",
      taskType: "ui"
    });

    expect(report.reviewable).toBe(false);
    expect(report.checks.find((check) => check.id === "ui_screenshot")).toMatchObject({
      passed: false
    });
  });

  it("accepts research evidence without touched files when durable sources and risks are present", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_growth_content_research",
      events: [
        event(1, "mailbox.message.sent", "agent_growth_content_research", {
          body: "intent_confirmed: 共享使命已确认。",
          from: "agent_growth_content_research",
          messageType: "intent_confirmed",
          taskId: "task_growth",
          to: "agent_codex"
        }),
        event(2, "mailbox.message.sent", "agent_growth_content_research", {
          body: "向视觉位挑战：请补充小红书视觉样本。",
          from: "agent_growth_content_research",
          messageType: "peer_challenge",
          taskId: "task_growth",
          to: "agent_visual_benchmark"
        }),
        event(3, "evidence.submitted", "agent_growth_content_research", {
          evidenceFiles: [".dragonboat/evidence/agent_growth_content_research.md"],
          files: [".dragonboat/handoffs/agent_growth_content_research.md"],
          remainingRisks: ["WebSearch 400, 已标注来源可靠性。"],
          sources: ["https://www.uniqlo.com/"],
          summary: "增长内容研究完成。",
          taskId: "task_growth"
        })
      ],
      taskId: "task_growth",
      taskType: "research"
    });

    expect(report.reviewable).toBe(true);
    expect(report.checks.find((check) => check.id === "peer_checkpoint")).toMatchObject({
      passed: true
    });
  });

  it("rejects structured handoff evidence until the recipient acknowledges it", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_backend",
      events: [
        event(1, "handoff.submitted", "agent_backend", {
          ackRequired: true,
          claims: ["root project map is complete"],
          confidence: "high",
          from: "agent_backend",
          handoffId: "handoff_backend_frontend",
          openQuestions: ["none"],
          recipient: "agent_frontend",
          requiredAction: "consume contract before frontend implementation",
          sources: [".dragonboat/handoffs/agent_backend_to_agent_frontend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend",
          to: "agent_frontend"
        }),
        event(2, "evidence.submitted", "agent_backend", {
          commandsRun: ["npm run demo:test"],
          files: [".dragonboat/evidence/agent_backend.md"],
          remainingRisks: ["none"],
          summary: "Backend evidence ready.",
          taskId: "task_backend",
          touchedFiles: ["apps/demo-web/src/shared/evidenceGate.ts"],
          workspaceProof: "tracked workspace checked"
        })
      ],
      taskId: "task_backend",
      taskType: "general"
    });

    expect(report.reviewable).toBe(false);
    expect(report.checks.find((check) => check.id === "recipient_ack")).toMatchObject({
      passed: false
    });
  });

  it("treats an acknowledged structured handoff as a reviewable durable handoff", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_backend",
      events: [
        event(1, "handoff.submitted", "agent_backend", {
          ackRequired: true,
          claims: ["root project map is complete"],
          confidence: "high",
          from: "agent_backend",
          handoffId: "handoff_backend_frontend",
          openQuestions: ["none"],
          recipient: "agent_frontend",
          requiredAction: "consume contract before frontend implementation",
          sources: [".dragonboat/handoffs/agent_backend_to_agent_frontend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend",
          to: "agent_frontend"
        }),
        event(2, "handoff.acknowledged", "agent_frontend", {
          ackBy: "agent_frontend",
          handoffId: "handoff_backend_frontend",
          note: "Contract consumed.",
          status: "consumed",
          taskId: "task_backend"
        }),
        event(3, "evidence.submitted", "agent_backend", {
          commandsRun: ["npm run demo:test"],
          files: [".dragonboat/evidence/agent_backend.md"],
          remainingRisks: ["none"],
          summary: "Backend evidence ready.",
          taskId: "task_backend",
          touchedFiles: ["apps/demo-web/src/shared/evidenceGate.ts"],
          workspaceProof: "tracked workspace checked"
        })
      ],
      taskId: "task_backend",
      taskType: "general"
    });

    expect(report.reviewable).toBe(true);
    expect(report.checks.find((check) => check.id === "mailbox_before_evidence")).toMatchObject({
      passed: true
    });
    expect(report.checks.find((check) => check.id === "recipient_ack")).toMatchObject({
      passed: true
    });
  });

  it("accepts snake_case structured handoff fields", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_backend",
      events: [
        event(1, "handoff.submitted", "agent_backend", {
          ack_required: true,
          claims: ["root project map is complete"],
          confidence: "high",
          from: "agent_backend",
          handoffId: "handoff_backend_frontend",
          open_questions: ["none"],
          recipient: "agent_frontend",
          required_action: "consume contract before frontend implementation",
          sources: [".dragonboat/handoffs/agent_backend_to_agent_frontend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend",
          to: "agent_frontend"
        }),
        event(2, "handoff.acknowledged", "agent_frontend", {
          ackBy: "agent_frontend",
          handoffId: "handoff_backend_frontend",
          note: "Contract consumed.",
          status: "consumed",
          taskId: "task_backend"
        }),
        event(3, "evidence.submitted", "agent_backend", {
          commandsRun: ["npm run demo:test"],
          files: [".dragonboat/evidence/agent_backend.md"],
          remainingRisks: ["none"],
          summary: "Backend evidence ready.",
          taskId: "task_backend",
          touchedFiles: ["apps/demo-web/src/shared/evidenceGate.ts"],
          workspaceProof: "tracked workspace checked"
        })
      ],
      taskId: "task_backend",
      taskType: "general"
    });

    expect(report.reviewable).toBe(true);
    expect(report.checks.find((check) => check.id === "recipient_ack")).toMatchObject({
      passed: true
    });
  });

  it("requires screenshots and browser commands for browser research evidence", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_visual_benchmark",
      events: [
        event(1, "mailbox.message.sent", "agent_visual_benchmark", {
          body: "intent_confirmed: 视觉研究位已确认。",
          from: "agent_visual_benchmark",
          messageType: "intent_confirmed",
          taskId: "task_visual",
          to: "agent_codex"
        }),
        event(2, "mailbox.message.sent", "agent_visual_benchmark", {
          body: "请模特匹配位确认 body_proportion 约束。",
          from: "agent_visual_benchmark",
          messageType: "peer_challenge",
          taskId: "task_visual",
          to: "agent_model_matching_research"
        }),
        event(3, "evidence.submitted", "agent_visual_benchmark", {
          evidenceFiles: [".dragonboat/evidence/agent_visual_benchmark.md"],
          files: [".dragonboat/handoffs/agent_visual_benchmark.md"],
          remainingRisks: ["只验证了 DragonBoat command deck smoke 页面。"],
          sources: ["http://127.0.0.1:5173"],
          summary: "Browser research smoke finished.",
          taskId: "task_visual"
        })
      ],
      taskId: "task_visual",
      taskType: "browser_research"
    });

    expect(report.reviewable).toBe(false);
    expect(report.checks.find((check) => check.id === "browser_screenshot")).toMatchObject({
      passed: false
    });
    expect(report.checks.find((check) => check.id === "browser_command")).toMatchObject({
      passed: false
    });
  });

  it("requires sourced and independently reviewed claims for workflow claim evidence", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_runtime_review",
      events: [
        event(1, "mailbox.message.sent", "agent_runtime_review", {
          body: "Runtime claims ready for refuter review.",
          from: "agent_runtime_review",
          messageType: "review",
          taskId: "task_workflow_claims",
          to: "agent_refuter"
        }),
        event(2, "claim.submitted", "agent_runtime_review", {
          claim: "events.ndjson is JSON envelope, not true NDJSON.",
          claimId: "claim_ledger_format",
          sources: ["handoffs/runtime.md"],
          status: "unverified",
          taskId: "task_workflow_claims"
        }),
        event(3, "claim.reviewed", "agent_refuter", {
          claimId: "claim_ledger_format",
          status: "supported",
          taskId: "task_workflow_claims"
        }),
        event(4, "evidence.submitted", "agent_runtime_review", {
          commandsRun: ["dragonboat workflow validate --plan .dragonboat/workflows/audit.json"],
          files: [".dragonboat/evidence/runtime-claims.md"],
          remainingRisks: ["none"],
          summary: "Workflow claims reviewed.",
          taskId: "task_workflow_claims",
          touchedFiles: ["apps/demo-web/src/shared/agenticWorkflow.ts"],
          workspaceProof: "tracked workspace checked"
        })
      ],
      taskId: "task_workflow_claims",
      taskType: "workflow_claim"
    });

    expect(report.reviewable).toBe(true);
    expect(report.checks.find((check) => check.id === "claims_independently_checked")).toMatchObject({
      passed: true
    });
  });

  it("rejects workflow claim evidence when a refuted claim is still included", () => {
    const report = evaluateEvidenceGate({
      agentId: "agent_product_review",
      events: [
        event(1, "mailbox.message.sent", "agent_product_review", {
          body: "Product claims ready.",
          from: "agent_product_review",
          messageType: "review",
          taskId: "task_product_claims",
          to: "agent_refuter"
        }),
        event(2, "claim.submitted", "agent_product_review", {
          claim: "Large agent count alone proves value.",
          claimId: "claim_agent_count",
          sources: ["notes/product.md"],
          status: "unverified",
          taskId: "task_product_claims"
        }),
        event(3, "claim.reviewed", "agent_refuter", {
          claimId: "claim_agent_count",
          finalSynthesisIncluded: true,
          status: "refuted",
          taskId: "task_product_claims"
        }),
        event(4, "evidence.submitted", "agent_product_review", {
          commandsRun: ["dragonboat workflow validate --plan .dragonboat/workflows/audit.json"],
          files: [".dragonboat/evidence/product-claims.md"],
          remainingRisks: ["refuted claim still appears"],
          summary: "Product claims reviewed.",
          taskId: "task_product_claims",
          touchedFiles: ["docs/product-features.md"],
          workspaceProof: "tracked workspace checked"
        })
      ],
      taskId: "task_product_claims",
      taskType: "workflow_claim"
    });

    expect(report.reviewable).toBe(false);
    expect(report.checks.find((check) => check.id === "refuted_claims_excluded")).toMatchObject({
      passed: false
    });
  });
});
