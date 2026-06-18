import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DemoLanguage } from "../shared/types";
import { AgentConfigStore, type AgentRuntimeConfig } from "./agentConfig";
import { resolveClaudeCommand } from "./cliArgs";
import { CrewPtyManager } from "./crewPtyManager";
import type { DemoEngine } from "./demoEngine";
import type { TerminalHub } from "./terminalHub";

export interface StartFullstackCliRunInput {
  crewPtyManager?: CrewPtyAdapter;
  engine: DemoEngine;
  env?: Record<string, string | undefined>;
  language: DemoLanguage;
  repoRoot: string;
  runDir: string;
  runId: string;
  startupMode?: "fullstack" | "idle";
  terminalHub: TerminalHub;
  worktreeFactory?: (repoRoot: string, worktreeDir: string) => string;
  workspaceLayout?: WorkspaceLayout;
}

interface WorkspaceLayout {
  gitRoot: string;
  relativeProjectPath: string;
}

export interface CrewPtyAdapter {
  isRunning(runId: string, agentId: string): boolean;
  startAgent(input: {
    agentId: string;
    args: string[];
    command: string;
    cwd: string;
    engine: DemoEngine;
    env?: Record<string, string | undefined>;
    runId: string;
  }): Promise<unknown>;
  stopAgent?(runId: string, agentId: string): boolean;
  write(runId: string, agentId: string, text: string, options?: { echo?: string }): boolean | void;
}

const ROWER_TASKS = [
  {
    agentId: "agent_frontend",
    sessionId: "11111111-1111-4111-8111-111111111111",
    title: "Frontend Rower",
    prompt:
      "你是 DragonBoat 全栈案例的前端划手。读取 docs/skills/dragonboat-rower.md，负责注册登录、看板、列表与卡片拖拽排序 UI，并通过 mailbox 及时向后端与 QA/Ops 交接。请使用中文输出关键进展。"
  },
  {
    agentId: "agent_backend",
    sessionId: "22222222-2222-4222-8222-222222222222",
    title: "Backend Rower",
    prompt:
      "你是 DragonBoat 全栈案例的后端划手。读取 docs/skills/dragonboat-rower.md，负责认证、看板、列表、卡片与排序 API，并在接口契约可用后立刻交给前端。请使用中文输出关键进展。"
  },
  {
    agentId: "agent_qa_ops",
    sessionId: "33333333-3333-4333-8333-333333333333",
    title: "QA/Ops Rower",
    prompt:
      "你是 DragonBoat 全栈案例的 QA/Ops 划手。读取 docs/skills/dragonboat-rower.md，负责前后端联调检查、自动化测试与证据汇总，并及时向前端/后端索要验收点。请使用中文输出关键进展。"
  }
] as const;
const DEFAULT_CLAUDE_ROWER_PERMISSION_MODE = "auto";
const CLAUDE_ROWER_ALLOWED_TOOLS = [
  "Bash(.dragonboat/bin/dragonboat *)",
  "Bash(./.dragonboat/bin/dragonboat *)",
  "Bash(npm *)",
  "Bash(git *)",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep"
].join(",");

function appendTerminalLine(terminalHub: TerminalHub, runId: string, agentId: string, line: string) {
  terminalHub.append(runId, agentId, `${line}\n`);
}

function ensureRunDirectories(runDir: string) {
  for (const child of ["logs", "task-packets", "uploads"]) {
    mkdirSync(join(runDir, child), { recursive: true });
  }
}

function writeTaskPackets(runDir: string) {
  for (const task of ROWER_TASKS) {
    writeFileSync(join(runDir, "task-packets", `${task.agentId}.md`), `${task.prompt}\n`);
  }
}

function ensureRowerWorktree(repoRoot: string, worktreeDir: string) {
  if (existsSync(join(worktreeDir, ".git"))) {
    return `using existing worktree: ${worktreeDir}`;
  }

  mkdirSync(dirname(worktreeDir), { recursive: true });

  const result = spawnSync("git", ["worktree", "add", "--detach", worktreeDir, "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status === 0) {
    return result.stdout.trim();
  }

  mkdirSync(worktreeDir, { recursive: true });
  return `git worktree add failed; using isolated directory fallback: ${result.stderr.trim() || "unknown error"}`;
}

function resolveWorkspaceLayout(repoRoot: string): WorkspaceLayout {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const prefix = spawnSync("git", ["rev-parse", "--show-prefix"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (gitRoot.status !== 0) {
    return {
      gitRoot: repoRoot,
      relativeProjectPath: ""
    };
  }

  return {
    gitRoot: gitRoot.stdout.trim() || repoRoot,
    relativeProjectPath: prefix.status === 0 ? prefix.stdout.trim().replace(/\/$/, "") : ""
  };
}

function projectCwd(worktreeDir: string, relativeProjectPath: string) {
  return relativeProjectPath ? join(worktreeDir, relativeProjectPath) : worktreeDir;
}

function worktreeRootForRun(runDir: string) {
  const runsDir = dirname(runDir);
  const maybeDragonBoatDir = dirname(runsDir);

  if (maybeDragonBoatDir.endsWith(".dragonboat")) {
    return join(dirname(maybeDragonBoatDir), ".dragonboat-worktrees");
  }

  return join(runDir, ".dragonboat-worktrees");
}

function steererPrompt(language: DemoLanguage) {
  const zh = [
    "你是 DragonBoat 的唯一主 Agent / 鼓手。",
    "目标：构建支持用户注册登录、看板管理、列表与卡片拖拽排序的简易项目协作应用，并完成前后端接口联调及自动化测试。",
    "请输出三个结构化 task packet：frontend、backend、qa_ops。",
    "每个 task packet 必须包含任务边界、需要读取的共享上下文、交接对象、证据要求和风险点。",
    "所有 Agent 会话消息请使用中文。"
  ];
  const en = [
    "You are the single DragonBoat steerer.",
    "Goal: build a simple project collaboration app with auth, boards, lists, card drag sorting, API integration, and automated tests.",
    "Output three structured task packets: frontend, backend, qa_ops.",
    "Each task packet must include scope, shared context, handoff targets, evidence requirements, and risks.",
    "Use English for agent-facing messages in this run."
  ];

  return (language === "zh" ? zh : en).join("\n");
}

function appendFakeLifecycle({ engine, language, runId, terminalHub }: StartFullstackCliRunInput) {
  engine.appendCrewStatus("agent_codex", "planning");
  engine.appendCommandStarted("agent_codex", "codex", [
    "exec",
    "--json",
    "-C",
    process.cwd(),
    "-o",
    "agent_codex.final.md"
  ]);
  engine.appendCommandOutput("agent_codex", "Codex exec generated three task packets.");
  appendTerminalLine(terminalHub, runId, "agent_codex", "[agent_codex] Codex exec generated three task packets.");
  engine.appendCommandFinished("agent_codex", 0);

  for (const task of ROWER_TASKS) {
    engine.appendCrewStatus(task.agentId, "running");
    engine.appendCommandStarted(task.agentId, "claude", [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--name",
      task.agentId
    ]);
    engine.appendCommandOutput(task.agentId, `Claude ${task.title.toLowerCase()} received task packet.`);
    appendTerminalLine(terminalHub, runId, task.agentId, `[${task.agentId}] Claude ${task.title.toLowerCase()} received task packet.`);
    engine.appendCommandFinished(task.agentId, 0);
  }

  engine.runFullstackCase(language, { reset: false });
}

function codexInteractiveArgs(env: Record<string, string | undefined>, cwd: string, config: AgentRuntimeConfig) {
  const args = ["--no-alt-screen", "-c", "check_for_update_on_startup=false", "-C", cwd];
  const profile = env.DRAGONBOAT_CODEX_PROFILE?.trim();

  if (profile) {
    args.push("--profile", profile);
  } else if (config.model) {
    args.push("--model", config.model);
  }

  if (config.effort) {
    args.push("-c", `model_reasoning_effort="${config.effort}"`);
  }

  return args;
}

function claudeInteractiveArgs(
  agentId: string,
  sessionId: string,
  env: Record<string, string | undefined>,
  config: AgentRuntimeConfig
) {
  const args = [
    "--name",
    agentId,
    "--session-id",
    sessionId,
    "--permission-mode",
    env.DRAGONBOAT_CLAUDE_PERMISSION_MODE ?? DEFAULT_CLAUDE_ROWER_PERMISSION_MODE,
    `--allowedTools=${env.DRAGONBOAT_CLAUDE_ALLOWED_TOOLS ?? CLAUDE_ROWER_ALLOWED_TOOLS}`
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.effort) {
    args.push("--effort", config.effort);
  }

  return args;
}

function codexPtyEnv(env: Record<string, string | undefined>) {
  return {
    ...env,
    CODEX_TUI_DISABLE_KEYBOARD_ENHANCEMENT: env.CODEX_TUI_DISABLE_KEYBOARD_ENHANCEMENT ?? "1"
  };
}

function injectPrompt(
  crewPtyManager: Pick<CrewPtyAdapter, "write">,
  runId: string,
  agentId: string,
  prompt: string
) {
  crewPtyManager.write(runId, agentId, `${prompt}\r`, {
    echo: `[dragonboat] injected task prompt for ${agentId}`
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDelayMs(value: string | undefined, fallback: number) {
  if (process.env.VITEST) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function settleCliStartupPrompts(
  crewPtyManager: Pick<CrewPtyAdapter, "write">,
  runId: string,
  env: Record<string, string | undefined>
) {
  const noticeDelayMs = parseDelayMs(env.DRAGONBOAT_CLI_NOTICE_DELAY_MS, 3000);
  const trustRetryDelayMs = parseDelayMs(env.DRAGONBOAT_CLI_TRUST_RETRY_DELAY_MS, 2000);
  const readyDelayMs = parseDelayMs(env.DRAGONBOAT_CLI_READY_DELAY_MS, 5000);

  if (noticeDelayMs === 0 && trustRetryDelayMs === 0 && readyDelayMs === 0) {
    return;
  }

  await delay(noticeDelayMs);
  crewPtyManager.write(runId, "agent_codex", "\x1b[B\r", {
    echo: "[dragonboat] skipped Codex startup notice if present"
  });

  for (const task of ROWER_TASKS) {
    crewPtyManager.write(runId, task.agentId, "\r", {
      echo: "[dragonboat] confirmed Claude workspace trust prompt if present"
    });
  }

  await delay(trustRetryDelayMs);
  for (const task of ROWER_TASKS) {
    crewPtyManager.write(runId, task.agentId, "\r", {
      echo: "[dragonboat] retried Claude workspace trust confirmation"
    });
  }

  await delay(readyDelayMs);
}

export async function startFullstackCliRun(input: StartFullstackCliRunInput) {
  const { engine, env = process.env, language, repoRoot, runDir, runId, startupMode = "fullstack", terminalHub } = input;

  ensureRunDirectories(runDir);
  writeTaskPackets(runDir);

  if (env.DRAGONBOAT_ENABLE_REAL_CLI !== "1") {
    if (!env.VITEST) {
      throw new Error("Real CLI mode is disabled. Restart the DragonBoat demo API with DRAGONBOAT_ENABLE_REAL_CLI=1.");
    }

    appendFakeLifecycle(input);
    return engine.snapshot();
  }

  const crewPtyManager = input.crewPtyManager ?? new CrewPtyManager({ terminalHub });
  const agentConfigStore = new AgentConfigStore({ runDir });
  const configs = agentConfigStore.loadOrCreate({ env });
  const claudeCommand = resolveClaudeCommand(env);
  const layout = input.workspaceLayout ?? resolveWorkspaceLayout(repoRoot);
  const worktreeFactory = input.worktreeFactory ?? ensureRowerWorktree;
  const rowerStartInputs = ROWER_TASKS.map((task) => {
    const worktreeDir = join(worktreeRootForRun(runDir), runId, task.agentId);
    const worktreeNote = worktreeFactory(layout.gitRoot, worktreeDir);
    const cwd = projectCwd(worktreeDir, layout.relativeProjectPath);

    mkdirSync(cwd, { recursive: true });
    if (worktreeNote) {
      appendTerminalLine(terminalHub, runId, task.agentId, worktreeNote);
    }

    engine.appendCrewStatus(task.agentId, "running");

    return {
      agentId: task.agentId,
      args: claudeInteractiveArgs(task.agentId, task.sessionId, env, configs[task.agentId]),
      command: claudeCommand,
      cwd,
      engine,
      env,
      runId
    };
  });

  engine.appendCrewStatus("agent_codex", "planning");
  await Promise.all([
    crewPtyManager.startAgent({
      agentId: "agent_codex",
      args: codexInteractiveArgs(env, repoRoot, configs.agent_codex),
      command: "codex",
      cwd: repoRoot,
      engine,
      env: codexPtyEnv(env),
      runId
    }),
    ...rowerStartInputs.map((startInput) => crewPtyManager.startAgent(startInput))
  ]);

  await settleCliStartupPrompts(crewPtyManager, runId, env);

  if (startupMode === "idle") {
    return engine.snapshot();
  }

  injectPrompt(crewPtyManager, runId, "agent_codex", steererPrompt(language));
  for (const task of ROWER_TASKS) {
    injectPrompt(crewPtyManager, runId, task.agentId, task.prompt);
  }

  return engine.snapshot();
}
