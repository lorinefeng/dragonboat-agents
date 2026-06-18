// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CrewPtyManager, type CrewPtyProcess } from "./crewPtyManager";
import { DemoEngine } from "./demoEngine";
import { TerminalHub } from "./terminalHub";

function createFakePty(exitCode = 0): CrewPtyProcess {
  let dataHandler: ((chunk: string) => void) | null = null;
  let exitHandler: ((event: { exitCode: number; signal?: number }) => void) | null = null;

  return {
    kill: vi.fn(() => {
      exitHandler?.({
        exitCode
      });
    }),
    onData: vi.fn((handler) => {
      dataHandler = handler;
    }),
    onExit: vi.fn((handler) => {
      exitHandler = handler;
    }),
    resize: vi.fn(),
    write: vi.fn((chunk: string) => {
      dataHandler?.(`echo:${chunk}`);
    })
  };
}

describe("CrewPtyManager", () => {
  it("keeps a live PTY per run and agent, mirrors output, and supports stdin injection", async () => {
    const pty = createFakePty();
    const terminalHub = new TerminalHub();
    const engine = new DemoEngine({
      runId: "run_pty"
    });
    const manager = new CrewPtyManager({
      spawnPty: vi.fn(() => pty),
      terminalHub
    });

    await manager.startAgent({
      agentId: "agent_codex",
      args: ["--no-alt-screen", "-C", "/repo/cases/fullstack-collab-app"],
      command: "codex",
      cwd: "/repo/cases/fullstack-collab-app",
      engine,
      env: {},
      runId: "run_pty"
    });
    manager.write("run_pty", "agent_codex", "/effort xhigh\n", {
      echo: "[dragonboat] /effort xhigh"
    });

    expect(manager.isRunning("run_pty", "agent_codex")).toBe(true);
    expect(pty.write).toHaveBeenCalledWith("/effort xhigh\n");
    expect(terminalHub.snapshot("run_pty", "agent_codex")).toContain("$ codex --no-alt-screen");
    expect(terminalHub.snapshot("run_pty", "agent_codex")).toContain("[dragonboat] /effort xhigh");
    expect(engine.listEvents().map((event) => event.type)).toContain("command.started");
    expect(engine.listEvents().map((event) => event.type)).toContain("command.output");
  });

  it("records a terminal-visible failure when the PTY backend cannot spawn", async () => {
    const terminalHub = new TerminalHub();
    const engine = new DemoEngine({
      runId: "run_pty_failure"
    });
    const manager = new CrewPtyManager({
      spawnPty: vi.fn(() => {
        throw new Error("posix_spawnp failed.");
      }),
      terminalHub
    });

    await expect(
      manager.startAgent({
        agentId: "agent_codex",
        args: ["--no-alt-screen", "-C", "/repo"],
        command: "codex",
        cwd: "/repo",
        engine,
        env: {},
        runId: "run_pty_failure"
      })
    ).rejects.toThrow("posix_spawnp failed");

    expect(terminalHub.snapshot("run_pty_failure", "agent_codex")).toContain(
      "[dragonboat] failed to start agent_codex: posix_spawnp failed."
    );
    expect(engine.listEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: "agent_codex",
          type: "command.finished",
          payload: expect.objectContaining({
            exitCode: 127
          })
        })
      ])
    );
  });

  it("marks an agent done when its PTY exits successfully", async () => {
    const pty = createFakePty();
    const terminalHub = new TerminalHub();
    const engine = new DemoEngine({
      runId: "run_pty_exit"
    });
    const manager = new CrewPtyManager({
      spawnPty: vi.fn(() => pty),
      terminalHub
    });

    engine.registerCrewMember({
      agentId: "agent_backend",
      platform: "claude_code_cli",
      role: "backend",
      status: "running"
    });
    await manager.startAgent({
      agentId: "agent_backend",
      args: ["--print"],
      command: "claude",
      cwd: "/repo",
      engine,
      env: {},
      runId: "run_pty_exit"
    });
    pty.kill();

    expect(engine.snapshot().crew.rowers[0]).toMatchObject({
      id: "agent_backend",
      status: "done"
    });
  });

  it("syncs rower handoff and evidence files back to the tracked workspace on exit", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-pty-sync-"));
    const cwd = join(tempDir, "rower-worktree");
    const workspaceRoot = join(tempDir, "workspace");
    const pty = createFakePty();
    const terminalHub = new TerminalHub();
    const engine = new DemoEngine({
      runId: "run_pty_sync"
    });
    const manager = new CrewPtyManager({
      spawnPty: vi.fn(() => pty),
      terminalHub
    });

    try {
      mkdirSync(join(cwd, ".dragonboat", "handoffs"), { recursive: true });
      mkdirSync(join(cwd, ".dragonboat", "evidence"), { recursive: true });
      mkdirSync(join(workspaceRoot, ".dragonboat"), { recursive: true });
      writeFileSync(join(cwd, ".dragonboat", "handoffs", "agent_backend_to_agent_frontend_contract.md"), "contract\n");
      writeFileSync(join(cwd, ".dragonboat", "evidence", "agent_backend.md"), "evidence\n");

      await manager.startAgent({
        agentId: "agent_backend",
        args: ["--print"],
        command: "claude",
        cwd,
        engine,
        env: {
          DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
        },
        runId: "run_pty_sync"
      });
      pty.kill();

      expect(readFileSync(join(workspaceRoot, ".dragonboat", "handoffs", "agent_backend_to_agent_frontend_contract.md"), "utf8")).toBe(
        "contract\n"
      );
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "evidence", "agent_backend.md"), "utf8")).toBe("evidence\n");
      expect(terminalHub.snapshot("run_pty_sync", "agent_backend")).toContain("[dragonboat] synced rower artifacts to workspace");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("marks an agent blocked when its PTY exits with a non-zero code", async () => {
    const pty = createFakePty(1);
    const terminalHub = new TerminalHub();
    const engine = new DemoEngine({
      runId: "run_pty_exit_failed"
    });
    const manager = new CrewPtyManager({
      spawnPty: vi.fn(() => pty),
      terminalHub
    });

    engine.registerCrewMember({
      agentId: "agent_backend",
      platform: "claude_code_cli",
      role: "backend",
      status: "running"
    });
    await manager.startAgent({
      agentId: "agent_backend",
      args: ["--print"],
      command: "claude",
      cwd: "/repo",
      engine,
      env: {},
      runId: "run_pty_exit_failed"
    });
    pty.kill();

    expect(engine.snapshot().crew.rowers[0]).toMatchObject({
      id: "agent_backend",
      status: "blocked"
    });
  });
});
