// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DemoEngine } from "./demoEngine";
import { startFullstackCliRun } from "./realCliCrewRunner";
import { TerminalHub } from "./terminalHub";

describe("startFullstackCliRun", () => {
  it("starts four persistent interactive CLI agents and injects initial config plus prompts", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "dragonboat-real-cli-run-"));
    const repoRoot = join(runDir, "repo", "cases", "fullstack-collab-app");
    mkdirSync(repoRoot, {
      recursive: true
    });

    const started: Array<{ agentId: string; command: string; args: string[]; cwd: string }> = [];
    const writes: Array<{ agentId: string; text: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => true),
      startAgent: vi.fn(
        async (input: { agentId: string; args: string[]; command: string; cwd: string; engine: DemoEngine }) => {
          input.engine.appendCommandStarted(input.agentId, input.command, input.args, input.cwd);
          started.push(input);
        }
      ),
      write: vi.fn((runId: string, agentId: string, text: string) => {
        expect(runId).toBe("run_real");
        writes.push({
          agentId,
          text
        });
      })
    };
    const engine = new DemoEngine({
      runId: "run_real"
    });

    try {
      const snapshot = await startFullstackCliRun({
        crewPtyManager,
        engine,
        env: {
          DRAGONBOAT_CLAUDE_EFFORT: "max",
          DRAGONBOAT_CLAUDE_MODEL: "glm-5.1",
          DRAGONBOAT_CODEX_EFFORT: "xhigh",
          DRAGONBOAT_CODEX_MODEL: "gpt-5.5",
          DRAGONBOAT_ENABLE_REAL_CLI: "1"
        },
        language: "zh",
        repoRoot,
        runDir,
        runId: "run_real",
        terminalHub: new TerminalHub(),
        worktreeFactory: (_repoRoot: string, worktreeDir: string) => {
          mkdirSync(join(worktreeDir, "cases", "fullstack-collab-app"), {
            recursive: true
          });
          return "fake worktree ready";
        },
        workspaceLayout: {
          gitRoot: join(runDir, "repo"),
          relativeProjectPath: "cases/fullstack-collab-app"
        }
      });

      expect(started.map((entry) => entry.agentId)).toEqual([
        "agent_codex",
        "agent_frontend",
        "agent_backend",
        "agent_qa_ops"
      ]);
      expect(started.find((entry) => entry.agentId === "agent_codex")).toMatchObject({
        command: "codex",
        cwd: repoRoot
      });
      expect(started.find((entry) => entry.agentId === "agent_codex")?.args).toContain("--no-alt-screen");
      expect(started.find((entry) => entry.agentId === "agent_codex")?.args).toEqual(
        expect.arrayContaining(["-c", "check_for_update_on_startup=false", "--model", "gpt-5.5", "-c", 'model_reasoning_effort="xhigh"'])
      );
      expect(started.find((entry) => entry.agentId === "agent_frontend")?.cwd).toContain(
        ".dragonboat-worktrees/run_real/agent_frontend/cases/fullstack-collab-app"
      );
      expect(started.find((entry) => entry.agentId === "agent_frontend")?.args).toEqual(
        expect.arrayContaining(["--model", "glm-5.1", "--effort", "max"])
      );
      expect(started.find((entry) => entry.agentId === "agent_frontend")?.args).toEqual(
        expect.arrayContaining(["--permission-mode", "auto", expect.stringContaining("--allowedTools=")])
      );
      expect(started.find((entry) => entry.agentId === "agent_frontend")?.args.join(" ")).toContain("Bash(npm *)");
      expect(writes).toEqual(
        expect.arrayContaining([
          {
            agentId: "agent_codex",
            text: expect.stringContaining("唯一主 Agent")
          }
        ])
      );
      expect(writes.some((entry) => entry.agentId === "agent_backend" && entry.text.includes("后端划手"))).toBe(true);
      expect(snapshot.phase).toBe("running");
      expect(snapshot.crew.rowers.every((rower) => rower.status === "running")).toBe(true);
    } finally {
      rmSync(runDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("can start an idle real CLI crew without injecting the fullstack task prompts", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "dragonboat-idle-cli-run-"));
    const repoRoot = join(runDir, "repo");
    mkdirSync(repoRoot, {
      recursive: true
    });

    const writes: Array<{ agentId: string; text: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => true),
      startAgent: vi.fn(async () => undefined),
      write: vi.fn((runId: string, agentId: string, text: string) => {
        expect(runId).toBe("run_idle");
        writes.push({
          agentId,
          text
        });
      })
    };

    try {
      await startFullstackCliRun({
        crewPtyManager,
        engine: new DemoEngine({
          runId: "run_idle"
        }),
        env: {
          DRAGONBOAT_ENABLE_REAL_CLI: "1"
        },
        language: "zh",
        repoRoot,
        runDir,
        runId: "run_idle",
        startupMode: "idle",
        terminalHub: new TerminalHub(),
        worktreeFactory: (_repoRoot: string, worktreeDir: string) => {
          mkdirSync(worktreeDir, {
            recursive: true
          });
          return "fake worktree ready";
        },
        workspaceLayout: {
          gitRoot: repoRoot,
          relativeProjectPath: ""
        }
      });

      expect(writes).toEqual([]);
    } finally {
      rmSync(runDir, {
        force: true,
        recursive: true
      });
    }
  });
});
