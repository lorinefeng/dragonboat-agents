import { describe, expect, it } from "vitest";
import {
  createRowerCheckpoint,
  formatRowerCheckpointMarkdown,
  validateRowerCheckpoint
} from "./rowerCheckpoint";

describe("rower checkpoint", () => {
  it("creates a valid Chinese-facing rower state checkpoint", () => {
    const checkpoint = createRowerCheckpoint({
      agentId: "agent_backend",
      changedFiles: ["apps/demo-web/src/server/demoApi.ts"],
      currentFocus: "正在收尾 attach API",
      decisions: ["接管期间阻止 steerer 注入"],
      evidencePaths: [".dragonboat/evidence/backend.md"],
      handoffPaths: [".dragonboat/handoffs/backend.md"],
      nextActions: ["等待 steerer review"],
      openQuestions: ["是否需要 Web 手动输入入口"],
      risks: ["真实 PTY smoke 尚未执行"],
      runId: "run_demo",
      status: "running",
      summary: "协助模式和接管模式的后端接口已可审。",
      taskId: "task_backend",
      timestamp: "2026-06-20T00:00:00.000Z"
    });

    expect(validateRowerCheckpoint(checkpoint).ok).toBe(true);
    expect(formatRowerCheckpointMarkdown(checkpoint)).toContain("# 划手状态检查点");
    expect(formatRowerCheckpointMarkdown(checkpoint)).toContain("协助模式和接管模式的后端接口已可审。");
  });

  it("rejects empty summaries and missing timestamps", () => {
    const result = validateRowerCheckpoint({
      agentId: "agent_backend",
      runId: "run_demo",
      status: "running",
      summary: "",
      taskId: "task_backend"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(["summary is required", "timestamp is required"]));
  });
});
