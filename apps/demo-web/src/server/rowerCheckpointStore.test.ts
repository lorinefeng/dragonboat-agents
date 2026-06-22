import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRowerCheckpoint } from "../shared/rowerCheckpoint";
import { listRowerCheckpoints, readLatestRowerCheckpoint, writeRowerCheckpoint } from "./rowerCheckpointStore";

describe("rower checkpoint store", () => {
  it("writes run-local history and workspace latest pointers", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-checkpoint-store-"));

    try {
      const checkpoint = createRowerCheckpoint({
        agentId: "agent_backend",
        currentFocus: "测试检查点落盘",
        runId: "run_demo",
        status: "running",
        summary: "检查点已经可写。",
        taskId: "task_backend",
        timestamp: "2026-06-20T00:00:00.000Z"
      });
      const result = writeRowerCheckpoint({
        checkpoint,
        runDir: join(workspaceRoot, ".dragonboat", "runs", "run_demo"),
        workspaceRoot
      });

      expect(existsSync(result.historyJsonPath)).toBe(true);
      expect(existsSync(result.historyMarkdownPath)).toBe(true);
      expect(existsSync(result.latestJsonPath)).toBe(true);
      expect(existsSync(result.latestMarkdownPath)).toBe(true);
      expect(readLatestRowerCheckpoint(workspaceRoot, "agent_backend")?.summary).toBe("检查点已经可写。");
      expect(listRowerCheckpoints(join(workspaceRoot, ".dragonboat", "runs", "run_demo"), "agent_backend")).toHaveLength(1);
      expect(readFileSync(result.latestMarkdownPath, "utf8")).toContain("划手状态检查点");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });
});
