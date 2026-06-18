import { spawn as defaultSpawnPty } from "node-pty";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DemoEngine } from "./demoEngine";
import type { TerminalHub } from "./terminalHub";

export interface CrewPtyProcess {
  kill(signal?: string): void;
  onData(handler: (chunk: string) => void): void;
  onExit(handler: (event: { exitCode: number; signal?: number | string }) => void): void;
  resize(cols: number, rows: number): void;
  write(data: string): void;
}

type SpawnCrewPty = (
  command: string,
  args: string[],
  options: {
    cols: number;
    cwd: string;
    env: Record<string, string | undefined>;
    name: string;
    rows: number;
  }
) => CrewPtyProcess;

interface CrewPtyManagerOptions {
  spawnPty?: SpawnCrewPty;
  terminalHub: TerminalHub;
}

interface StartAgentInput {
  agentId: string;
  args: string[];
  command: string;
  cwd: string;
  engine: DemoEngine;
  env?: Record<string, string | undefined>;
  runId: string;
}

interface CrewPtySession {
  agentId: string;
  cwd: string;
  engine: DemoEngine;
  env: Record<string, string | undefined>;
  pending: string;
  process: CrewPtyProcess;
  runId: string;
  status: "running" | "exited";
}

function sessionKey(runId: string, agentId: string) {
  return `${runId}:${agentId}`;
}

function appendLine(terminalHub: TerminalHub, runId: string, agentId: string, line: string) {
  terminalHub.append(runId, agentId, `${line}\n`);
}

function copyDirectoryFiles(sourceDir: string, targetDir: string) {
  if (!existsSync(sourceDir)) {
    return 0;
  }

  let copied = 0;
  mkdirSync(targetDir, {
    recursive: true
  });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyDirectoryFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    mkdirSync(dirname(targetPath), {
      recursive: true
    });
    copyFileSync(sourcePath, targetPath);
    copied += 1;
  }

  return copied;
}

function syncRowerArtifactsToWorkspace(cwd: string, workspaceRoot?: string) {
  const root = workspaceRoot?.trim();

  if (!root || cwd === root) {
    return 0;
  }

  let copied = 0;
  for (const directory of ["handoffs", "evidence"]) {
    copied += copyDirectoryFiles(join(cwd, ".dragonboat", directory), join(root, ".dragonboat", directory));
  }

  return copied;
}

const require = createRequire(import.meta.url);

export function ensureNodePtySpawnHelperExecutable() {
  if (process.platform !== "darwin") {
    return;
  }

  const packagePath = require.resolve("node-pty/package.json");
  const helperPath = join(dirname(packagePath), "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");

  if (!existsSync(helperPath)) {
    return;
  }

  const helperStat = statSync(helperPath);

  if ((helperStat.mode & 0o111) === 0) {
    chmodSync(helperPath, helperStat.mode | 0o755);
  }
}

export class CrewPtyManager {
  private readonly sessions = new Map<string, CrewPtySession>();
  private readonly spawnPty: SpawnCrewPty;
  private readonly terminalHub: TerminalHub;

  constructor({ spawnPty, terminalHub }: CrewPtyManagerOptions) {
    this.spawnPty = spawnPty ?? (defaultSpawnPty as unknown as SpawnCrewPty);
    this.terminalHub = terminalHub;
  }

  async startAgent({ agentId, args, command, cwd, engine, env = process.env, runId }: StartAgentInput) {
    const key = sessionKey(runId, agentId);
    const existing = this.sessions.get(key);

    if (existing?.status === "running") {
      return existing;
    }

    engine.appendCommandStarted(agentId, command, args, cwd);
    appendLine(this.terminalHub, runId, agentId, `$ ${[command, ...args].join(" ")}`);

    let pty: CrewPtyProcess;
    try {
      ensureNodePtySpawnHelperExecutable();
      pty = this.spawnPty(command, args, {
        cols: 120,
        cwd,
        env: { ...process.env, ...env },
        name: "xterm-color",
        rows: 32
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const line = `[dragonboat] failed to start ${agentId}: ${message}`;

      appendLine(this.terminalHub, runId, agentId, line);
      engine.appendCommandOutput(agentId, line);
      engine.appendCommandFinished(agentId, 127, null);
      throw cause;
    }

    const session: CrewPtySession = {
      agentId,
      cwd,
      engine,
      env,
      pending: "",
      process: pty,
      runId,
      status: "running"
    };

    this.sessions.set(key, session);

    pty.onData((chunk) => {
      this.terminalHub.append(runId, agentId, chunk);
      session.pending += chunk.replace(/\r/g, "");

      const lines = session.pending.split("\n");
      session.pending = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          engine.appendCommandOutput(agentId, line);
        }
      }
    });

    pty.onExit(({ exitCode, signal }) => {
      session.status = "exited";
      if (session.pending.trim()) {
        engine.appendCommandOutput(agentId, session.pending);
      }
      try {
        const copied = syncRowerArtifactsToWorkspace(session.cwd, session.env.DRAGONBOAT_WORKSPACE_ROOT);
        if (copied > 0) {
          appendLine(this.terminalHub, runId, agentId, `[dragonboat] synced rower artifacts to workspace (${copied} files)`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const line = `[dragonboat] failed to sync rower artifacts: ${message}`;
        appendLine(this.terminalHub, runId, agentId, line);
        engine.appendCommandOutput(agentId, line);
      }
      engine.appendCommandFinished(agentId, exitCode, signal ? String(signal) : null);
      engine.appendCrewStatus(agentId, exitCode === 0 ? "done" : "blocked");
      appendLine(this.terminalHub, runId, agentId, `command finished exitCode=${exitCode}`);
    });

    return session;
  }

  isRunning(runId: string, agentId: string) {
    return this.sessions.get(sessionKey(runId, agentId))?.status === "running";
  }

  write(runId: string, agentId: string, text: string, options: { echo?: string } = {}) {
    const session = this.sessions.get(sessionKey(runId, agentId));
    if (!session || session.status !== "running") {
      return false;
    }

    if (options.echo) {
      appendLine(this.terminalHub, runId, agentId, options.echo);
    }

    session.process.write(text);
    return true;
  }

  stopAgent(runId: string, agentId: string) {
    const session = this.sessions.get(sessionKey(runId, agentId));
    if (!session || session.status !== "running") {
      return false;
    }

    appendLine(this.terminalHub, runId, agentId, `[dragonboat] stopping ${agentId}`);
    session.process.kill();
    session.status = "exited";
    return true;
  }

  stopRun(runId: string) {
    for (const [key, session] of this.sessions) {
      if (!key.startsWith(`${runId}:`) || session.status !== "running") {
        continue;
      }
      session.process.kill();
      session.status = "exited";
    }
  }
}
