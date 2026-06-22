import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as spawnPty } from "node-pty";
import WebSocket from "ws";
import {
  type AcceptanceCheck,
  type AcceptanceReport,
  formatAcceptanceReport,
  parseAcceptanceEvents,
  validateFirstCrewLoopAcceptance
} from "../shared/firstCrewLoopAcceptance.ts";
import { validateReplayLaunchAcceptance } from "../shared/replayLaunchAcceptance.ts";
import {
  createContextDelta,
  formatContextBundleMarkdown,
  formatContextDeltaMarkdown,
  type ContextBundle
} from "../shared/contextBundle.ts";
import { loadEventRecords, writeEventRecordEnvelope } from "../shared/dragonboatEventRecord.ts";
import {
  evaluateCrewSupervision,
  formatCrewSupervisionReport,
  type SupervisionExpectation
} from "../shared/crewSupervision.ts";
import {
  assessDelegationFit,
  createSealedTaskPacket,
  DELEGATION_SCORE_FIELDS,
  formatDelegationAssessmentMarkdown,
  parseDelegationFitAssessment,
  type DelegationFitAssessment,
  type DelegationScoreField,
  type DelegationScores
} from "../shared/delegationEconomics.ts";
import {
  assessAgenticMode,
  createWorkflowPlan,
  formatAgenticModeAssessmentMarkdown,
  formatWorkflowPlanMarkdown,
  parseWorkflowPlan,
  validateWorkflowPlan,
  type AgenticTaskSignals,
  type WorkflowPlan,
  type WorkflowPhase,
  type WorkflowPhaseKind
} from "../shared/agenticWorkflow.ts";
import { formatEvidenceGateReport, evaluateEvidenceGate, type EvidenceTaskType } from "../shared/evidenceGate.ts";
import {
  createRowerCheckpoint,
  formatRowerCheckpointMarkdown,
  validateRowerCheckpoint,
  type RowerCheckpoint
} from "../shared/rowerCheckpoint.ts";
import {
  createHandoffId,
  normalizeHandoffAckStatus,
  normalizeHandoffConfidence,
  pendingStructuredHandoffs
} from "../shared/structuredHandoff.ts";
import { compareBenchmarkRecords, createBenchmarkRecord, type BenchmarkMode, type BenchmarkRecord } from "../shared/benchmarkHarness.ts";
import { compareBenchmarkSuite, createBenchmarkSuite, type BenchmarkSuite } from "../shared/benchmarkSuite.ts";
import { selectBudgetAwareRoute, type ModelRouteCandidate, type SubscriptionBudget } from "../shared/budgetRouter.ts";
import { buildCapabilityMatrix } from "../shared/capabilityMatrix.ts";
import { planComputePlacement, type ComputeTaskRequirements, type ComputeWorker } from "../shared/computeFarm.ts";
import { createCostTrace } from "../shared/costTrace.ts";
import {
  assessPrivacyRoute,
  DEFAULT_PRIVACY_POLICY,
  redactSecrets,
  scanSecrets,
  type PrivacyRouteFile
} from "../shared/privacyRouting.ts";
import { createSubscriptionAdvisorReport, type SubscriptionInventoryItem } from "../shared/subscriptionAdvisor.ts";
import { createMarketplaceInstallRecord, getMarketplacePack, listMarketplacePacks, type MarketplacePackKind } from "../shared/agentMarketplace.ts";
import { learnCapabilitiesFromTrace } from "../shared/traceLearning.ts";
import {
  DEFAULT_ROUTING_POLICY,
  extractTaskPacketRoute,
  formatRouteForTaskPacket,
  mergeRouteWithRecommendation,
  recommendRoute,
  type RoutingPolicy
} from "../shared/routingPolicy.ts";
import { getWorkflowPack, listWorkflowPacks, renderWorkflowPackPlan } from "../shared/workflowPack.ts";
import {
  advanceStateAfterDecision,
  decideWatchdogAction,
  type CodexStopHookInput,
  type WatchdogDecisionResult
} from "../shared/watchdogDecision.ts";
import { loadWatchdogState, saveWatchdogState, watchdogStatePath } from "../shared/watchdogState.ts";
import { createSharedFactBoard, formatSharedFactBoardMarkdown } from "../shared/sharedFactBoard.ts";
import { checkReleaseReadiness, formatReleaseReadinessReport } from "../shared/releaseReadiness.ts";
import type { DemoEvent, DemoRun, StructuredHandoffInput } from "../shared/types.ts";
import { checkClaudeRouteHealth } from "../server/claudeRouteHealth.ts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SpawnOptions {
  cwd: string;
  env: Record<string, string | undefined>;
}

type SpawnForeground = (command: string, args: string[], options: SpawnOptions) => Promise<number>;
type SpawnBackground = (command: string, args: string[], options: SpawnOptions) => { pid?: number };
type CheckClaudeRouteHealth = typeof checkClaudeRouteHealth;
type PortAvailable = (port: number) => Promise<boolean>;

interface DragonBoatCliDependencies {
  checkClaudeRoute?: CheckClaudeRouteHealth;
  cwd?: () => string;
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
  openUrl?: (url: string) => Promise<void>;
  pid?: number;
  portAvailable?: PortAvailable;
  readFile?: (path: string) => string;
  spawnBackground?: SpawnBackground;
  spawnForeground?: SpawnForeground;
  stdin?: () => Promise<string>;
  stdout?: Pick<typeof process.stdout, "write">;
  stderr?: Pick<typeof process.stderr, "write">;
}

interface SteererRegisterResponse {
  runId?: string;
  session?: {
    runId?: string;
  };
}

interface SessionListResponse {
  activeRunId?: string;
  sessions?: Array<{
    phase?: string;
    runId?: string;
    workspaceRoot?: string;
  }>;
}

const DEFAULT_API_URL = "http://127.0.0.1:8787";
const DEFAULT_WEB_URL = "http://127.0.0.1:5173";
const CODEX_ROUTE_PATTERN =
  /\b((?:gpt-)?\d(?:[\w.-]*\d)?|gpt-[\w.-]+|o\d(?:[\w.-]+)?|codex-[\w.-]+)\s+(low|medium|high|xhigh)\b/gi;
const require = createRequire(import.meta.url);
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, "../../../..");
const DRAGONBOAT_BIN = resolve(REPO_ROOT, "bin/dragonboat.mjs");
const MANAGED_BLOCK_START = "<!-- BEGIN DRAGONBOAT -->";
const MANAGED_BLOCK_END = "<!-- END DRAGONBOAT -->";
const ADVISOR_KINDS = new Set(["advice", "research", "risk"]);
const MAILBOX_MESSAGE_TYPES = new Set([
  "advice",
  "blocker",
  "contract",
  "evidence",
  "instruction",
  "intent_confirmed",
  "peer_challenge",
  "question",
  "research",
  "review",
  "risk",
  "status",
  "worklog"
]);

export interface ObservedCodexRoute {
  effort: string;
  model: string;
}

function apiUrl(env: Record<string, string | undefined>) {
  return (env.DRAGONBOAT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

function webUrl(env: Record<string, string | undefined>) {
  return (env.DRAGONBOAT_WEB_URL || DEFAULT_WEB_URL).replace(/\/$/, "");
}

function runIdFromEnv(env: Record<string, string | undefined>) {
  const runId = env.DRAGONBOAT_RUN_ID?.trim();

  if (!runId) {
    throw new Error("DRAGONBOAT_RUN_ID is required. Run `dragonboat steer` first or export the active run id.");
  }

  return runId;
}

function parseFlags(args: string[]) {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item?.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      flags.set(key, "true");
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return flags;
}

function hasHelpFlag(args: string[]) {
  return args.includes("--help") || args.includes("-h");
}

function messageSendUsage() {
  return [
    "Usage:",
    "  dragonboat message send --to <agentId> --type <type> --body <text> [--from <agentId>] [--task <taskId>]",
    "",
    "Message types:",
    `  ${[...MAILBOX_MESSAGE_TYPES].sort().join(", ")}`,
    "",
    "Examples:",
    "  dragonboat message send --from agent_backend --to agent_frontend --task task_backend --type contract --body \"Contract handoff ready.\"",
    "  dragonboat message send --from agent_visual_benchmark --to agent_model_matching_research --task task_visual --type peer_challenge --body \"Please challenge the body proportion assumptions.\""
  ].join("\n");
}

function browserDoctorUsage() {
  return [
    "Usage:",
    "  dragonboat browser doctor [--workspace <path>] [--run <runId>] [--browser chrome|edge] [--cdp-url <url>] [--skip-external]",
    "",
    "Checks the local browser-research capability used by visual rowers:",
    "  - writable .dragonboat/browser-artifacts/<run_id>/ directory",
    "  - Claude Code web-access plugin visibility",
    "  - Chrome/Edge CDP health when not skipped",
    "",
    "If CDP is not reachable, open chrome://inspect/#remote-debugging or edge://inspect/#remote-debugging, enable remote debugging, and retry."
  ].join("\n");
}

function initUsage() {
  return [
    "Usage:",
    "  dragonboat init [--workspace <path>]",
    "",
    "Scaffold DragonBoat into a project workspace.",
    "",
    "Generated files include:",
    "  .dragonboat/skills/",
    "  .dragonboat/commands.md",
    "  .dragonboat/routing-policy.json",
    "  .codex/hooks.json",
    "  .dragonboat/bin/dragonboat",
    "  AGENTS.md managed DragonBoat block"
  ].join("\n");
}

function multiFlagValues(args: string[], name: string) {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== `--${name}`) {
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      values.push("true");
      continue;
    }

    values.push(value);
    index += 1;
  }

  return values.map((value) => value.trim()).filter(Boolean);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(async () => ({ error: await response.text().catch(() => response.statusText) }));
    const message = typeof body.error === "string" ? body.error : response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(
  fetcher: Fetcher,
  url: string,
  body: unknown,
  method: "DELETE" | "PATCH" | "POST" = "POST"
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      body: method === "DELETE" ? undefined : JSON.stringify(body),
      headers:
        method === "DELETE"
          ? undefined
          : {
              "content-type": "application/json"
            },
      method
    });
  } catch (cause) {
    const parsedUrl = new URL(url);
    throw new Error(
      [
        `DragonBoat API is not reachable at ${parsedUrl.origin}.`,
        "Start the local DragonBoat web/API server first: `npm run demo:dev`.",
        `Original error: ${cause instanceof Error ? cause.message : String(cause)}`
      ].join(" ")
    );
  }

  return readJson<T>(response);
}

async function getJson<T>(fetcher: Fetcher, url: string) {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch (cause) {
    const parsedUrl = new URL(url);
    throw new Error(
      [
        `DragonBoat API is not reachable at ${parsedUrl.origin}.`,
        "Start the local DragonBoat web/API server first: `npm run demo:dev`.",
        `Original error: ${cause instanceof Error ? cause.message : String(cause)}`
      ].join(" ")
    );
  }

  return readJson<T>(response);
}

function isApiReachabilityError(cause: unknown) {
  return cause instanceof Error && cause.message.includes("DragonBoat API is not reachable");
}

function stripTerminalControls(input: string) {
  return input
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, " ")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, " ")
    .replace(/\u001B[@-Z\\-_]/g, " ");
}

export function extractCodexRoute(chunk: string): ObservedCodexRoute | null {
  const text = stripTerminalControls(chunk).replace(/\s+/g, " ");
  let route: ObservedCodexRoute | null = null;

  for (const match of text.matchAll(CODEX_ROUTE_PATTERN)) {
    route = {
      effort: match[2].toLowerCase(),
      model: match[1]
    };
  }

  return route;
}

export function createCodexRouteObserver(onRoute: (route: ObservedCodexRoute) => void) {
  let lastRoute = "";

  return (chunk: string) => {
    const route = extractCodexRoute(chunk);
    if (!route) {
      return;
    }

    const key = `${route.model}:${route.effort}`;
    if (key === lastRoute) {
      return;
    }

    lastRoute = key;
    onRoute(route);
  };
}

function spawnWithInheritedStdio(command: string, args: string[], options: SpawnOptions) {
  return new Promise<number>((resolveExit) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      resolveExit(code ?? 0);
    });

    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      resolveExit(127);
    });
  });
}

function defaultSpawnBackground(command: string, args: string[], options: SpawnOptions) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: true,
    env: options.env as NodeJS.ProcessEnv,
    stdio: "ignore"
  });
  child.unref();
  return {
    pid: child.pid
  };
}

async function defaultOpenUrl(url: string) {
  const opener =
    process.platform === "darwin"
      ? { args: [url], command: "open" }
      : process.platform === "win32"
        ? { args: ["/c", "start", "", url], command: "cmd" }
        : { args: [url], command: "xdg-open" };

  await new Promise<void>((resolveOpen) => {
    const child = spawn(opener.command, opener.args, {
      stdio: "ignore"
    });
    child.on("error", () => resolveOpen());
    child.on("exit", () => resolveOpen());
  });
}

function syncObservedCodexRoute(env: Record<string, string | undefined>, route: ObservedCodexRoute) {
  const runId = env.DRAGONBOAT_RUN_ID?.trim();

  if (!runId) {
    return;
  }

  postJson(
    fetch,
    `${apiUrl(env)}/api/sessions/${encodeURIComponent(runId)}/agents/agent_codex/config`,
    {
      effort: route.effort,
      model: route.model
    },
    "PATCH"
  ).catch(() => {
    // The foreground Codex session must stay usable even if the web API is restarted.
  });
}

function ensureNodePtySpawnHelperExecutable() {
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

async function defaultSpawnForeground(command: string, args: string[], options: SpawnOptions) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) {
    return spawnWithInheritedStdio(command, args, options);
  }

  try {
    ensureNodePtySpawnHelperExecutable();
    const pty = spawnPty(command, args, {
      cols: stdout.columns || 120,
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      name: "xterm-256color",
      rows: stdout.rows || 32
    });
    const observeRoute = createCodexRouteObserver((route) => syncObservedCodexRoute(options.env, route));
    const wasRaw = stdin.isRaw;
    const onInput = (chunk: Buffer) => {
      pty.write(chunk.toString("utf8"));
    };
    const onResize = () => {
      pty.resize(stdout.columns || 120, stdout.rows || 32);
    };

    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onInput);
    stdout.on("resize", onResize);

    return await new Promise<number>((resolveExit) => {
      pty.onData((chunk) => {
        stdout.write(chunk);
        if (command === "codex") {
          observeRoute(chunk);
        }
      });

      pty.onExit(({ exitCode }) => {
        stdin.off("data", onInput);
        stdout.off("resize", onResize);
        if (typeof stdin.setRawMode === "function") {
          stdin.setRawMode(wasRaw);
        }
        resolveExit(exitCode ?? 0);
      });
    });
  } catch (cause) {
    process.stderr.write(
      `[dragonboat] PTY foreground bridge failed; falling back to inherited stdio. ${
        cause instanceof Error ? cause.message : String(cause)
      }\n`
    );
    return spawnWithInheritedStdio(command, args, options);
  }
}

function requireFlag(flags: Map<string, string>, name: string) {
  const value = flags.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required --${name}.`);
  }

  return value;
}

function optionalFlag(flags: Map<string, string>, name: string, fallback: string) {
  const value = flags.get(name)?.trim();
  return value || fallback;
}

function bootstrapManagedBlock() {
  return [
    MANAGED_BLOCK_START,
    "## DragonBoat Crew Kit",
    "",
    "This workspace is managed by DragonBoat, a local-first coordination layer for coding-agent crews.",
    "",
    "When you are the Codex steerer in this project:",
    "",
    "1. Read `.dragonboat/skills/dragonboat-steerer.md` before planning or launching workers.",
    "2. Draft a crew plan and ask the human to confirm rower count and roles before starting or stopping rowers.",
    "3. Use `.dragonboat/bin/dragonboat` as the local control command for rower, mailbox, evidence, advisor, route-sync, and acceptance operations.",
    "4. Read `.dragonboat/crew-lessons.md` before planning, summarize relevant lessons into task packets, and append new lessons after review.",
    "5. Choose rower models through `.dragonboat/routing-policy.json` and include a `## Route` block in every task packet.",
    "6. Assess Delegation Fit before launching rowers; only crew tasks that are sealed, parallelizable, and evidence-gated.",
    "7. Write a shared Crew Mission Contract into every multi-rower task packet so rowers understand the common objective, their stance, peer obligations, and final synthesis owner.",
    "8. Run `dragonboat browser doctor` before launching browser/visual/social research rowers, and block if web-access or CDP is unhealthy.",
    "9. Write rower task packets under `.dragonboat/task-packets/` and include `.dragonboat/skills/dragonboat-rower.md` plus `.dragonboat/crew-lessons.md` in every worker prompt.",
    "10. After starting rowers, use `.dragonboat/bin/dragonboat supervise wait` to wait for intent confirmation, status, evidence, or blockers instead of relying only on the Stop-hook watchdog.",
    "11. Use structured handoffs plus recipient ack for substantive peer deliveries; use `dragonboat task complete` to atomically close handoff, evidence, status, and gate events.",
    "12. Prefer adjusting existing rowers with mailbox messages before starting more agents; stop unused rowers to avoid token waste.",
    "13. The repo-local Codex Stop hook in `.codex/hooks.json` runs DragonBoat watchdog checks so rower completions can wake the steerer for review.",
    "",
    "Useful command references live in `.dragonboat/commands.md`. Advisor notes are advisory context, not human instructions. First Crew Loop acceptance criteria live in `docs/first-crew-loop-acceptance.md` in the DragonBoat repository.",
    MANAGED_BLOCK_END,
    ""
  ].join("\n");
}

function upsertManagedBlock(existing: string) {
  const block = bootstrapManagedBlock();
  const start = existing.indexOf(MANAGED_BLOCK_START);
  const end = existing.indexOf(MANAGED_BLOCK_END);

  if (start >= 0 && end > start) {
    return `${existing.slice(0, start).trimEnd()}\n\n${block}${existing.slice(end + MANAGED_BLOCK_END.length).trimStart()}`;
  }

  const prefix = existing.trimEnd();
  return prefix ? `${prefix}\n\n${block}` : `# AGENTS.md\n\n${block}`;
}

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function writeFileIfChanged(path: string, content: string, mode?: number) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    writeFileSync(path, content);
  }

  if (typeof mode === "number") {
    chmodSync(path, mode);
  }
}

function writeFileIfMissing(path: string, content: string, mode?: number) {
  if (!existsSync(path)) {
    writeFileSync(path, content);
  }

  if (typeof mode === "number") {
    chmodSync(path, mode);
  }
}

function dragonboatWatchdogHookCommand(workspaceRoot: string) {
  const localDragonBoat = join(workspaceRoot, ".dragonboat", "bin", "dragonboat");
  const innerCommand = `${shellQuote(localDragonBoat)} watchdog stop-check --workspace ${shellQuote(workspaceRoot)}`;
  return `bash -lc ${shellQuote(innerCommand)}`;
}

function dragonboatStopHook(workspaceRoot: string) {
  return {
    command: dragonboatWatchdogHookCommand(workspaceRoot),
    statusMessage: "DragonBoat watchdog checking rower activity",
    timeout: 10,
    type: "command"
  };
}

function upsertCodexHooks(existing: string, workspaceRoot: string) {
  let config: Record<string, unknown>;

  try {
    config = existing.trim() ? (JSON.parse(existing) as Record<string, unknown>) : {};
  } catch {
    config = {};
  }

  const hooks = typeof config.hooks === "object" && config.hooks !== null ? { ...(config.hooks as Record<string, unknown>) } : {};
  const stopEntries = Array.isArray(hooks.Stop) ? hooks.Stop : [];
  const cleanedStopEntries = stopEntries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }

      const record = entry as Record<string, unknown>;
      const innerHooks = Array.isArray(record.hooks)
        ? record.hooks.filter((hook) => {
            if (!hook || typeof hook !== "object") {
              return true;
            }

            const command = (hook as Record<string, unknown>).command;
            return typeof command !== "string" || !command.includes("watchdog stop-check");
          })
        : [];

      return {
        ...record,
        hooks: innerHooks
      };
    })
    .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return true;
      }

      const innerHooks = (entry as Record<string, unknown>).hooks;
      return !Array.isArray(innerHooks) || innerHooks.length > 0;
    });

  hooks.Stop = [
    ...cleanedStopEntries,
    {
      hooks: [dragonboatStopHook(workspaceRoot)]
    }
  ];

  return `${JSON.stringify(
    {
      ...config,
      hooks
    },
    null,
    2
  )}\n`;
}

function commandsDoc() {
  return [
    "# DragonBoat Local Commands",
    "",
    "Run these commands from the foreground Codex steerer session. The `dragonboat steer` launcher injects `DRAGONBOAT_RUN_ID`, `DRAGONBOAT_WORKSPACE_ROOT`, and `DRAGONBOAT_API_URL` for you.",
    "",
    "## Setup",
    "",
    "- Install a user-level DragonBoat command shim: `dragonboat install-command --target /opt/homebrew/bin/dragonboat`",
    "- After installation, run DragonBoat from any workspace with `dragonboat init`, `dragonboat doctor`, and `dragonboat steer` instead of relying on a repo-relative `./bin/dragonboat.mjs` path.",
    "- For a full provider/browser readiness check, run `dragonboat doctor --deep --model <model> --effort <effort>` before launching visual or browser rowers.",
    "- Start the local API and Web command deck: `dragonboat deck --workspace <path> --open`",
    "- Launch the native foreground Codex steerer and open the deck: `dragonboat steer --workspace <path> --open`",
    "- Create a no-token local projection smoke run for the Web deck: `dragonboat smoke run --workspace <path> --open`",
    "- The workspace-local fallback remains `.dragonboat/bin/dragonboat` after `dragonboat init` or `dragonboat steer` has bootstrapped the project.",
    "",
    "## Browser Research",
    "",
    "- Check local browser research readiness: `.dragonboat/bin/dragonboat browser doctor --workspace <path>`",
    "- Run a Kimi multimodal browser smoke: `.dragonboat/bin/dragonboat browser smoke --workspace <path> --url http://127.0.0.1:5173 --model kimi-k2.6 --effort max`",
    "- If CDP is unavailable, enable Chrome/Edge remote debugging and rerun browser doctor before starting visual/product-page/social-platform research rowers.",
    "- Browser-backed rowers should use route capabilities such as `browser_research`, `dynamic_page_research`, `visual_research`, or `social_platform_research`; DragonBoat routes these to `kimi-k2.6 / max / block_if_unhealthy` by default.",
    "- Browser research evidence must include screenshot paths, source URLs, browser/CDP commands, and remaining risks.",
    "",
    "## Crew Control",
    "",
    "- Start a rower: `.dragonboat/bin/dragonboat rower start --role <role> --id <agentId> --prompt-file .dragonboat/task-packets/<agentId>.md [--new-wave]`",
    "- Use `--new-wave` on the first rower of an unrelated new task so DragonBoat archives old rowers from the current graph while keeping their raw ledger, mailbox, evidence, and terminal logs.",
    "- Stop a rower: `.dragonboat/bin/dragonboat rower stop --id <agentId>`",
    "- Wait for live rower milestones: `.dragonboat/bin/dragonboat supervise wait --agents <agentId,agentId> --expect intent_confirmed,status,evidence --timeout <seconds>`",
    "- Reconcile externally written local events into the live API stream: `.dragonboat/bin/dragonboat run reconcile --run <runId>`",
    "",
    "Use `supervise wait` after starting rowers when the steerer needs to remain live for intent confirmation, first status, evidence, blockers, or timeout-driven correction. The Stop-hook watchdog is a wake-up bridge, not a live supervision loop.",
    "",
    "## Rower Attach And Checkpoints",
    "",
    "- List rowers that can be inspected or entered: `.dragonboat/bin/dragonboat rower list --latest`",
    "- Read-only terminal view: `.dragonboat/bin/dragonboat rower attach --agent <agentId> --mode view --latest`",
    "- Assist a rower with a one-off input while the steerer keeps scheduling authority: `.dragonboat/bin/dragonboat rower attach --agent <agentId> --mode assist --latest --text \"<extra context>\" --end`",
    "- Take over a rower for direct operation: `.dragonboat/bin/dragonboat rower attach --agent <agentId> --mode takeover --latest`",
    "- Release a stale or completed takeover lock: `.dragonboat/bin/dragonboat rower release --agent <agentId> --latest`",
    "- Create a 划手状态检查点 before a rower ends: `.dragonboat/bin/dragonboat rower checkpoint create --agent <agentId> --task <taskId> --status <status> --summary \"<what is true now>\" --current-focus \"<current focus>\" --changed-file <path> --next-action \"<next action>\"`",
    "- Read the latest checkpoint for planning: `.dragonboat/bin/dragonboat rower checkpoint latest --agent <agentId> --format markdown`",
    "- Claude Code Stop hooks call `rower checkpoint ensure`; if it reports a missing checkpoint, the rower must create one before claiming the task is closed.",
    "- A checkpoint is a Chinese-facing recovery artifact, not a replacement for mailbox, handoff, evidence, or raw terminal logs.",
    "",
    "## Mailbox",
    "",
    "- Send an instruction: `.dragonboat/bin/dragonboat message send --to <agentId> --type instruction --body <text>`",
    "- Confirm shared mission understanding: `.dragonboat/bin/dragonboat message send --from <agentId> --to agent_codex --task <taskId> --type intent_confirmed --body \"<shared mission, role stance, non-goals understood>\"`",
    "- Send a progress worklog: `.dragonboat/bin/dragonboat message send --from <agentId> --to agent_codex --task <taskId> --type worklog --body \"<what changed, what is blocked, next step>\"`",
    "- Challenge or align with a peer: `.dragonboat/bin/dragonboat message send --from <agentId> --to <peerAgentId> --task <taskId> --type peer_challenge --body \"<claim, concern, or request for counter-evidence>\"`",
    "- Submit a structured handoff: `.dragonboat/bin/dragonboat handoff submit --from <agentId> --to <recipientId> --task <taskId> --summary \"<one-screen summary>\" --claim \"<claim>\" --source <path-or-url> --confidence high --open-question \"none\" --required-action \"<what recipient must do>\" --file .dragonboat/handoffs/<name>.md`",
    "- Acknowledge a handoff after consuming it: `.dragonboat/bin/dragonboat handoff ack --handoff <handoffId> --from <recipientId> --status consumed --note \"<what was consumed or questioned>\"`",
    "- Use plain `message send` for short instruction/worklog/challenge messages; use `handoff submit` for delivery objects that downstream agents must consume.",
    "- Send QA/Ops review to the steerer: `.dragonboat/bin/dragonboat message send --from agent_qa_ops --to agent_codex --task task_qa_ops --type evidence --body \"<pass/fail, evidence path, remaining risks>\"`",
    "- Broadcast context: `.dragonboat/bin/dragonboat message broadcast --to <agentId,agentId> --body <text>`",
    "",
    "Mailbox is durable, but handoff completion is not fire-and-forget: ack-required structured handoffs remain pending until the recipient records `handoff ack`.",
    "",
    "## Evidence",
    "",
    "- Atomically close a rower task when handoff and evidence artifacts are ready: `.dragonboat/bin/dragonboat task complete --from <agentId> --to <recipientId> --task <taskId> --handoff .dragonboat/handoffs/<name>.md --evidence .dragonboat/evidence/<name>.md --summary \"<result>\" --claim \"<claim>\" --source <path-or-url> --confidence high --open-question \"none\" --required-action \"<recipient action>\" --command \"<check>\" --workspace-proof \"<tracked workspace check>\" --risk \"none\"`",
    "- Submit evidence: `.dragonboat/bin/dragonboat evidence submit --from <agentId> --task <taskId> --summary <text>`",
    "- Submit structured evidence: `.dragonboat/bin/dragonboat evidence submit --from <agentId> --task <taskId> --summary <text> --file <path> --touched <path> --command <cmd> --workspace-proof <text> --risk <text> --source <url-or-path> --screenshot <path> --task-type <type>`",
    "- Gate evidence before review: `.dragonboat/bin/dragonboat evidence gate --agent <agentId> --task <taskId> --task-type general|ui|runtime|backend_contract|research|browser_research|workflow_claim`",
    "- Submit a sourced workflow claim: `.dragonboat/bin/dragonboat claim submit --from <agentId> --task <taskId> --claim-id <id> --claim <text> --source <url-or-file>`",
    "- Review or refute a claim: `.dragonboat/bin/dragonboat claim review --from <agentId> --task <taskId> --claim-id <id> --status supported|refuted|conflicted|needs_human --note <text>`",
    "- Submit QA/Ops acceptance evidence: `.dragonboat/bin/dragonboat evidence submit --from agent_qa_ops --task task_qa_ops --summary \"<acceptance result, checks run, risks>\"`",
    "",
    "Evidence submitted is not the same as reviewable. Run `evidence gate` before accepting a rower claim when the task needs proof beyond a simple event.",
    "",
    "## Delegation Economics",
    "",
    "- Assess whether a task should be crewed: `.dragonboat/bin/dragonboat delegate assess --context-amortization <0-3> --parallel-split <0-3> --interface-stability <0-3> --acceptance-executability <0-3> --low-cost-rower-fit <0-3> --shared-state-penalty <0-3> --runtime-drift-penalty <0-3>`",
    "- Generate a sealed task packet: `.dragonboat/bin/dragonboat delegate packet --agent <agentId> --role <role> --task <taskId> --mission <text> --fit <json> --input <path> --allowed-path <path> --acceptance <text> --out .dragonboat/task-packets/<agentId>.md`",
    "- Add browser capability to a sealed packet: `--capability browser_research --browser-domain <domain> --source <url> --screenshot-requirement <text>`",
    "- Add shared crew mission fields when more than one rower is involved: `--shared-mission <text> --synthesis-owner agent_codex --stance <text> --peer <agentId> --non-goal <text>`",
    "- Record a benchmark: `.dragonboat/bin/dragonboat benchmark record --latest --mode single_agent|crew|agent_team|dynamic_workflow --task-name <name> --task-class <class> --benchmark-id <id>`",
    "- Compare economics: `.dragonboat/bin/dragonboat benchmark compare --solo <solo.json> --crew <crew.json>`",
    "",
    "Low-fit tasks should default to the foreground steerer. Crew launches are for sealed, parallel, reviewable work where the context and verification savings can outweigh coordination cost.",
    "",
    "## P2 Compute, Privacy, and Learning",
    "",
    "- Plan local/remote compute placement: `.dragonboat/bin/dragonboat compute plan --worker <json> --capability <capability> --privacy-class private_code --allow-remote true --format json`",
    "- Check privacy-aware routing before cloud execution: `.dragonboat/bin/dragonboat privacy route --provider openai --file <path> --format json`",
    "- Redact a file before cloud-safe handoff: `.dragonboat/bin/dragonboat privacy redact --file <path> --out <redacted-path>`",
    "- Generate subscription advice from traces and inventory: `.dragonboat/bin/dragonboat subscription advise --subscription <json> --events <events.ndjson>`",
    "- Install or inspect community packs: `.dragonboat/bin/dragonboat marketplace list|show|install --pack community.browser-research`",
    "- Learn capability preferences from trace history: `.dragonboat/bin/dragonboat capability learn --events <events.ndjson> --minimum-attempts 2`",
    "",
    "Remote compute and cloud routing must pass privacy policy first. Private code on remote team infrastructure returns `human_approval_required`; local-only or secret-bearing files should stay local or be explicitly redacted.",
    "",
    "## Dynamic Workflow",
    "",
    "- Assess agentic mode: `.dragonboat/bin/dragonboat workflow assess --context-amortization <0-3> --parallel-split <0-3> --interface-stability <0-3> --acceptance-executability <0-3> --low-cost-rower-fit <0-3> --shared-state-penalty <0-3> --runtime-drift-penalty <0-3> --expected-agents <n> --phase-count <n> --cross-check`",
    "- Draft a provider-neutral workflow plan: `.dragonboat/bin/dragonboat workflow draft --goal <text> --out .dragonboat/workflows/<id>.json`",
    "- Validate a workflow plan before running: `.dragonboat/bin/dragonboat workflow validate --plan .dragonboat/workflows/<id>.json`",
    "- Rehearse phase events without launching rowers: `.dragonboat/bin/dragonboat workflow run --plan .dragonboat/workflows/<id>.json --dry-run`",
    "- Run phased workflow waves: `.dragonboat/bin/dragonboat workflow run --plan .dragonboat/workflows/<id>.json --phase-timeout-seconds 900 --phase-retries 1`",
    "- Control a workflow run: `.dragonboat/bin/dragonboat workflow pause|resume|stop --workflow <id> --run <runId> --reason <text>`",
    "",
    "Dynamic Workflow is for staged, cross-checked, high-uncertainty work. Use it to make fan-out, refuters, claim voting, cost caps, and human approval gates explicit; do not use agent count as proof of value.",
    "",
    "## Acceptance",
    "",
    "- Validate the minimum release smoke loop: `.dragonboat/bin/dragonboat acceptance smoke --latest`",
    "- Generate a no-token release smoke run, then validate it: `.dragonboat/bin/dragonboat smoke run && .dragonboat/bin/dragonboat acceptance smoke --latest`",
    "- Validate the active real crew-loop run from the foreground steerer: `.dragonboat/bin/dragonboat acceptance first-crew-loop`",
    "- Validate a specific run: `.dragonboat/bin/dragonboat acceptance first-crew-loop --run <run_id>`",
    "- Validate the latest local run: `.dragonboat/bin/dragonboat acceptance first-crew-loop --latest`",
    "- Validate an explicit event file: `.dragonboat/bin/dragonboat acceptance first-crew-loop --events .dragonboat/runs/<run_id>/events.ndjson`",
    "- Validate replay launch narrative and MP4 evidence: `.dragonboat/bin/dragonboat acceptance replay-launch --run <run_id> --video <path-to-mp4>`",
    "",
    "## Advisor Channel",
    "",
    "- Send advisor advice to the steerer: `.dragonboat/bin/dragonboat advisor send --kind advice --body \"<suggestion>\"`",
    "- Send advisor research or risk notes: `.dragonboat/bin/dragonboat advisor send --kind research --body \"<finding>\" --source <path-or-url>`",
    "- Read advisor notes without treating them as user instructions: `.dragonboat/bin/dragonboat advisor inbox`",
    "",
    "## Context Bundle",
    "",
    "- Print a provider-neutral Markdown context bundle for an agent: `.dragonboat/bin/dragonboat context bundle --agent <agentId> --task <taskId>`",
    "- Print the same bundle as JSON for adapter tooling: `.dragonboat/bin/dragonboat context bundle --agent <agentId> --task <taskId> --format json`",
    "- Print a shared fact board for the steerer: `.dragonboat/bin/dragonboat fact board --latest --format markdown`",
    "- Print an incremental context delta for a rower: `.dragonboat/bin/dragonboat context delta --to <agentId> --since <seq> --latest --format markdown`",
    "",
    "Context bundles collect recipient identity, task context, relevant mailbox handoffs, advisor notes when addressed to the steerer, recent events, and evidence into a provider-neutral payload. Context deltas carry only newly confirmed facts, conflicts, pending handoffs, open questions, and artifacts since a sequence number. Use them when handing context across different CLI agents instead of copying raw session text.",
    "",
    "## Crew Lessons",
    "",
    "- Shared lesson file: `.dragonboat/crew-lessons.md`",
    "- Steerer: read it before crew planning, cite relevant lessons in task packets, and append new lessons after QA/user review.",
    "- Rower: read it before acting and treat applicable lessons as workflow constraints unless the current task packet says otherwise.",
    "- UI/UX lessons currently require live `http://127.0.0.1:5173` preview, screenshot evidence, and main-workspace visibility checks before frontend handoff.",
    "",
    "## Steerer Watchdog",
    "",
    "- Workspace-local Codex Stop hook: `.codex/hooks.json`",
    "- Stop-check command used by the hook: `.dragonboat/bin/dragonboat watchdog stop-check`",
    "- The generated hook uses the current workspace's `.dragonboat/bin/dragonboat` plus `--workspace <path>`; it must not infer the workspace from `git rev-parse --show-toplevel`, because DragonBoat workspaces can be nested under a larger Git repository.",
    "- The hook reads `.dragonboat/runs/<run_id>/events.ndjson` and `.dragonboat/runs/<run_id>/watchdog-state.json`; it does not require the local API to be reachable.",
    "- If rowers submit new mailbox/evidence/blocker/lifecycle events while the foreground Codex steerer is about to stop, the hook asks Codex to continue one more turn for review.",
    "- A newly added repo-local hook may require a fresh `dragonboat steer` launch or `/hooks` trust/review inside Codex before it is active.",
    "",
    "## Route Sync",
    "",
    "- Recommend a rower route: `.dragonboat/bin/dragonboat route recommend --role <role> --capability <text|vision|browser_research|dynamic_page_research|visual_research|social_platform_research> --format task-packet`",
    "- Select a budget-aware route from explicit candidates and subscription limits: `.dragonboat/bin/dragonboat route budget --candidate '<json>' --subscription '<json>' --capability <capability> --estimated-input-tokens <n> --estimated-output-tokens <n> --max-cost-usd <n>`",
    "- Apply a route to a running Agent config: `.dragonboat/bin/dragonboat route set --agent <agentId> --role <role> --model <model> --effort <effort>`",
    "- Sync foreground Codex routing: `.dragonboat/bin/dragonboat config set --agent agent_codex --model <model> --effort <effort>`",
    "",
    "## Capability, Cost, Packs, And Benchmark Suites",
    "",
    "- Build agent/model skill cards from the run ledger: `.dragonboat/bin/dragonboat capability matrix --latest`",
    "- Trace token/cost proxy and waste from run events: `.dragonboat/bin/dragonboat cost trace --latest`",
    "- List workflow packs: `.dragonboat/bin/dragonboat workflow pack list`",
    "- Inspect a workflow pack: `.dragonboat/bin/dragonboat workflow pack show --pack pr_review`",
    "- Install pack metadata into the workspace: `.dragonboat/bin/dragonboat workflow pack install --pack frontend_multimodal`",
    "- Draft a workflow from a pack: `.dragonboat/bin/dragonboat workflow pack draft --pack security_audit --goal \"<goal>\" --out .dragonboat/workflows/<id>.json`",
    "- Compare single, crew, agent-team, and workflow records: `.dragonboat/bin/dragonboat benchmark suite --record <single.json> --record <workflow.json>`",
    "",
    "Always prefer these DragonBoat commands over ad hoc process control so the web command deck can replay what happened.",
    ""
  ].join("\n");
}

function routingPolicyDoc() {
  return `${JSON.stringify(DEFAULT_ROUTING_POLICY, null, 2)}\n`;
}

function bootstrapReadme(workspaceRoot: string) {
  return [
    "# DragonBoat Bootstrap Kit",
    "",
    `Workspace: \`${workspaceRoot}\``,
    "",
    "This directory gives the foreground Codex steerer a local, auditable toolbox for controlling Claude Code rowers through DragonBoat.",
    "",
    "- `skills/dragonboat-steerer.md`: operating rules for the Codex steerer.",
    "- `skills/dragonboat-rower.md`: operating rules to attach to every rower task packet.",
    "- `commands.md`: command reference for rower, mailbox, evidence, and route-sync operations.",
    "- `crew-lessons.md`: shared steerer/rower operating lessons learned from prior runs.",
    "- `routing-policy.json`: capability-aware rower model routing policy used by the steerer.",
    "- `bin/dragonboat`: workspace-local shim to the DragonBoat CLI.",
    "- `../.codex/hooks.json`: repo-local Codex Stop hook for DragonBoat steerer watchdog continuation.",
    "- `task-packets/`: write worker prompts here before launching rowers.",
    "- `handoffs/`: store peer-to-peer handoff notes and diffs here.",
    "- `evidence/`: store completion evidence for steerer review here.",
    ""
  ].join("\n");
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function shimScript() {
  return ["#!/usr/bin/env sh", `exec ${shellQuote(DRAGONBOAT_BIN)} "$@"`, ""].join("\n");
}

function ensureDir(path: string) {
  mkdirSync(path, {
    recursive: true
  });
}

function installBootstrapKit(workspaceRoot: string) {
  const dragonboatDir = join(workspaceRoot, ".dragonboat");
  const codexDir = join(workspaceRoot, ".codex");
  const skillDir = join(dragonboatDir, "skills");
  const binDir = join(dragonboatDir, "bin");

  for (const directory of [dragonboatDir, skillDir, binDir, join(dragonboatDir, "task-packets"), join(dragonboatDir, "handoffs"), join(dragonboatDir, "evidence")]) {
    ensureDir(directory);
  }
  ensureDir(codexDir);

  writeFileIfChanged(join(skillDir, "dragonboat-steerer.md"), readRepoFile("docs/skills/dragonboat-steerer.md"));
  writeFileIfChanged(join(skillDir, "dragonboat-rower.md"), readRepoFile("docs/skills/dragonboat-rower.md"));
  writeFileIfChanged(join(dragonboatDir, "commands.md"), commandsDoc());
  writeFileIfMissing(join(dragonboatDir, "crew-lessons.md"), readRepoFile("docs/crew-lessons-template.md"));
  writeFileIfChanged(join(dragonboatDir, "routing-policy.json"), routingPolicyDoc());
  writeFileIfChanged(join(dragonboatDir, "README.md"), bootstrapReadme(workspaceRoot));
  writeFileIfChanged(join(binDir, "dragonboat"), shimScript(), 0o755);

  const codexHooksPath = join(codexDir, "hooks.json");
  writeFileIfChanged(codexHooksPath, upsertCodexHooks(existsSync(codexHooksPath) ? readFileSync(codexHooksPath, "utf8") : "", workspaceRoot));

  for (const directory of ["task-packets", "handoffs", "evidence"]) {
    writeFileIfChanged(join(dragonboatDir, directory, ".keep"), "");
  }

  const agentsPath = join(workspaceRoot, "AGENTS.md");
  const currentAgents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  writeFileIfChanged(agentsPath, upsertManagedBlock(currentAgents));
}

function bootstrapChecks(workspaceRoot: string) {
  const requiredPaths = [
    "AGENTS.md",
    ".dragonboat/README.md",
    ".dragonboat/commands.md",
    ".dragonboat/crew-lessons.md",
    ".dragonboat/routing-policy.json",
    ".dragonboat/bin/dragonboat",
    ".codex/hooks.json",
    ".dragonboat/skills/dragonboat-steerer.md",
    ".dragonboat/skills/dragonboat-rower.md",
    ".dragonboat/task-packets",
    ".dragonboat/handoffs",
    ".dragonboat/evidence"
  ];
  const missing = requiredPaths.filter((path) => !existsSync(join(workspaceRoot, path)));
  const agents = existsSync(join(workspaceRoot, "AGENTS.md")) ? readFileSync(join(workspaceRoot, "AGENTS.md"), "utf8") : "";

  if (!agents.includes(MANAGED_BLOCK_START) || !agents.includes(MANAGED_BLOCK_END)) {
    missing.push("AGENTS.md DragonBoat managed block");
  }

  const hooksPath = join(workspaceRoot, ".codex", "hooks.json");
  const hooks = existsSync(hooksPath) ? readFileSync(hooksPath, "utf8") : "";
  if (!hooks.includes("watchdog stop-check")) {
    missing.push(".codex/hooks.json DragonBoat Stop hook");
  }
  if (hooks.includes("git rev-parse")) {
    missing.push(".codex/hooks.json workspace-local DragonBoat Stop hook");
  }
  if (!hooks.includes(join(workspaceRoot, ".dragonboat", "bin", "dragonboat"))) {
    missing.push(".codex/hooks.json workspace DragonBoat command path");
  }

  return missing;
}

function readRoutingPolicy(workspaceRoot: string): RoutingPolicy {
  const path = join(workspaceRoot, ".dragonboat", "routing-policy.json");

  if (!existsSync(path)) {
    return DEFAULT_ROUTING_POLICY;
  }

  return JSON.parse(readFileSync(path, "utf8")) as RoutingPolicy;
}

function splitFlagList(value: string | undefined) {
  return (value ?? "")
    .split(/[,，、]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function initWorkspace(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));

  installBootstrapKit(workspaceRoot);
  deps.stdout.write(`DragonBoat bootstrap kit ready at ${join(workspaceRoot, ".dragonboat")}\n`);
  return 0;
}

function defaultCommandInstallTarget(env: Record<string, string | undefined>) {
  const home = env.HOME?.trim();
  if (!home) {
    throw new Error("Missing HOME. Provide --target <path> for the DragonBoat command shim.");
  }

  return join(home, ".local", "bin", "dragonboat");
}

async function installCommand(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const target = resolve(optionalFlag(flags, "target", defaultCommandInstallTarget(deps.env)));

  ensureDir(dirname(target));
  writeFileIfChanged(target, shimScript(), 0o755);

  deps.stdout.write(
    [
      `DragonBoat command installed at ${target}`,
      "",
      "Use it from any workspace:",
      "  dragonboat init",
      "  dragonboat doctor",
      "  dragonboat doctor --deep --model kimi-k2.6 --effort max",
      "  DRAGONBOAT_API_URL=http://127.0.0.1:8787 dragonboat steer",
      "",
      `If your shell cannot find it, add this directory to PATH: ${dirname(target)}`,
      ""
    ].join("\n")
  );
  return 0;
}

async function findResumableRun(fetcher: Fetcher, base: string, workspaceRoot: string) {
  const sessions = await getJson<SessionListResponse>(fetcher, `${base}/api/sessions`);
  const candidates = (sessions.sessions ?? []).filter(
    (session) => session.runId && session.phase === "running" && session.workspaceRoot && resolve(session.workspaceRoot) === workspaceRoot
  );

  const active = candidates.find((session) => session.runId === sessions.activeRunId);
  return active?.runId ?? candidates.at(0)?.runId;
}

function commandStatus(command: string, args: string[] = ["--version"]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000
  });

  if (result.error) {
    return {
      detail: result.error.message,
      ok: false
    };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split(/\r?\n/g).at(0) ?? "";
  return {
    detail: result.status === 0 ? output : output || `exited ${result.status}`,
    ok: result.status === 0
  };
}

async function fetchWithTimeout(fetcher: Fetcher, url: string, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function endpointHealth(fetcher: Fetcher, url: string) {
  try {
    const response = await fetchWithTimeout(fetcher, url);
    return {
      detail: response.ok ? "ok" : `failed (${response.status})`,
      ok: response.ok
    };
  } catch (cause) {
    return {
      detail: `offline (${cause instanceof Error ? cause.message : String(cause)})`,
      ok: false
    };
  }
}

function parsePortFromUrl(url: string, fallback: number) {
  try {
    const parsed = new URL(url);
    return Number.parseInt(parsed.port || (parsed.protocol === "https:" ? "443" : "80"), 10);
  } catch {
    return fallback;
  }
}

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.once("listening", () => {
      server.close(() => resolveAvailable(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(preferredPort: number, portAvailable: PortAvailable = isPortAvailable) {
  for (let offset = 0; offset < 50; offset += 1) {
    const candidate = preferredPort + offset;
    if (await portAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find an available port near ${preferredPort}.`);
}

function localUrl(port: number) {
  return `http://127.0.0.1:${port}`;
}

async function existingHttpEndpointLooksHealthy(fetcher: Fetcher, url: string, requiredText?: string) {
  try {
    const response = await fetchWithTimeout(fetcher, url, 1000);

    if (!response.ok) {
      return false;
    }

    if (!requiredText) {
      return true;
    }

    const body = await response.text();
    return body.includes(requiredText);
  } catch {
    return false;
  }
}

function validTcpPort(port: number) {
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

async function explicitDeckPortIsUsable(
  deps: Required<DragonBoatCliDependencies>,
  port: number,
  label: "API" | "Web",
  healthUrl: string,
  healthyEndpointText?: string
) {
  if (!validTcpPort(port)) {
    deps.stderr.write(`DragonBoat ${label} port must be an integer between 1 and 65535. Received: ${port}\n`);
    return false;
  }

  if (await deps.portAvailable(port)) {
    return true;
  }

  if (await existingHttpEndpointLooksHealthy(deps.fetcher, healthUrl, healthyEndpointText)) {
    deps.stdout.write(`DragonBoat ${label} port ${port} is already serving DragonBoat; reusing it.\n`);
    return true;
  }

  deps.stderr.write(
    [
      `DragonBoat ${label} port ${port} is already in use, but it does not look like a healthy DragonBoat ${label} service.`,
      `Use a free port, for example: dragonboat deck --${label === "API" ? "api" : "web"}-port <free-port>`,
      ""
    ].join("\n")
  );
  return false;
}

async function doctor(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const deep = flags.has("deep");
  const skipBrowserExternal = flags.has("skip-external") || flags.has("skip-browser");
  const skipRoute = flags.has("skip-route");
  const missing = bootstrapChecks(workspaceRoot);
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const nodeOk = Number.isFinite(nodeMajor) && nodeMajor >= 22;
  const git = commandStatus("git");
  const codex = commandStatus("codex");
  const claude = commandStatus("claude");
  const api = await endpointHealth(deps.fetcher, `${apiUrl(deps.env)}/api/sessions`);
  const web = await endpointHealth(deps.fetcher, webUrl(deps.env));
  const apiPort = parsePortFromUrl(apiUrl(deps.env), 8787);
  const webPort = parsePortFromUrl(webUrl(deps.env), 5173);
  const bootstrapOk = missing.length === 0;
  const artifactDir = join(workspaceRoot, ".dragonboat", "browser-artifacts", "doctor");
  let artifactsWritable = false;
  let artifactsDetail = artifactDir;

  try {
    ensureDir(artifactDir);
    writeFileSync(join(artifactDir, ".keep"), "");
    artifactsWritable = true;
  } catch (cause) {
    artifactsDetail = cause instanceof Error ? cause.message : String(cause);
  }

  const cdpUrl = optionalFlag(flags, "cdp-url", "http://127.0.0.1:3456/health");
  const webAccess = deep && !skipBrowserExternal
    ? checkClaudeWebAccessPlugin(deps.env)
    : {
        detail: deep ? "browser external checks skipped" : "run `dragonboat doctor --deep` or `dragonboat browser doctor`",
        skillDir: undefined,
        status: deep ? "skipped" : "not_checked"
      };
  const checkDeps =
    deep && !skipBrowserExternal && webAccess.status === "ok" && webAccess.skillDir
      ? runWebAccessCheckDeps(webAccess.skillDir, flags.get("browser")?.trim())
      : {
          detail: webAccess.detail,
          status: deep ? (skipBrowserExternal ? "skipped" : webAccess.status === "ok" ? "skipped" : "failed") : "not_checked"
        };
  const cdp =
    deep && !skipBrowserExternal && checkDeps.status === "ok"
      ? await checkCdpHealth(deps.fetcher, cdpUrl)
      : {
          detail: deep && skipBrowserExternal ? "browser external checks skipped" : deep ? checkDeps.detail : "run `dragonboat doctor --deep` or `dragonboat browser doctor`",
          status: deep ? (skipBrowserExternal ? "skipped" : "failed") : "not_checked"
        };
  const routeModel = optionalFlag(flags, "model", deps.env.DRAGONBOAT_CLAUDE_MODEL ?? deps.env.DRAGONBOAT_DEFAULT_CLAUDE_MODEL ?? "");
  const routeEffort = optionalFlag(flags, "effort", deps.env.DRAGONBOAT_CLAUDE_EFFORT ?? deps.env.DRAGONBOAT_DEFAULT_CLAUDE_EFFORT ?? "");
  const routeHealth = deep && !skipRoute
    ? await deps.checkClaudeRoute({
        cwd: workspaceRoot,
        effort: routeEffort || undefined,
        env: deps.env,
        model: routeModel || undefined,
        timeoutMs: 30_000
      })
    : undefined;
  const routeOk = !deep || skipRoute || routeHealth?.ok === true;
  const browserOk = artifactsWritable && (!deep || skipBrowserExternal || (webAccess.status === "ok" && checkDeps.status === "ok" && cdp.status === "ok"));

  deps.stdout.write(
    [
      "DragonBoat doctor",
      `workspace: ${workspaceRoot}`,
      `mode: ${deep ? "deep" : "quick"}`,
      `Node.js: ${nodeOk ? "ok" : "warning"} (${process.versions.node})`,
      `git: ${git.ok ? "ok" : `missing (${git.detail})`}`,
      `Codex CLI: ${codex.ok ? `ok (${codex.detail})` : `missing (${codex.detail})`}`,
      `Claude Code: ${claude.ok ? `ok (${claude.detail})` : `missing (${claude.detail})`}`,
      `bootstrap kit: ${bootstrapOk ? "ok" : `missing ${missing.join(", ")}`}`,
      bootstrapOk ? "" : `Fix: run \`dragonboat init --workspace ${workspaceRoot}\``,
      `local API: ${api.ok ? "ok" : api.detail}`,
      api.ok ? "" : `Fix: run \`dragonboat deck --workspace ${workspaceRoot} --api-port ${apiPort} --web-port ${webPort}\``,
      `web deck: ${web.ok ? "ok" : web.detail}`,
      web.ok ? "" : `Fix: run \`dragonboat deck --workspace ${workspaceRoot} --api-port ${apiPort} --web-port ${webPort}\``,
      `browser artifacts: ${artifactsWritable ? "ok" : `failed (${artifactsDetail})`}`,
      `web-access plugin: ${webAccess.status}${webAccess.detail ? ` (${webAccess.detail})` : ""}`,
      `browser deps: ${checkDeps.status}${checkDeps.detail ? ` (${String(checkDeps.detail).split(/\r?\n/g).at(-1)})` : ""}`,
      `Chrome/CDP: ${cdp.status}${cdp.detail ? ` (${cdp.detail})` : ""}`,
      deep && !skipRoute
        ? `Claude route health: ${routeHealth?.ok ? "ok" : `failed (${routeHealth?.message ?? "unknown"})`}`
        : "Claude route health: not_checked (run `dragonboat doctor --deep --model <model> --effort <effort>`)",
      codex.ok ? "" : "Install Codex CLI before steering: https://developers.openai.com/codex",
      claude.ok ? "" : "Install and authenticate Claude Code before launching rowers.",
      deep && cdp.status === "failed"
        ? "Fix: enable Chrome/Edge remote debugging, then rerun `dragonboat doctor --deep` or `dragonboat browser doctor`."
        : "",
      deep && webAccess.status !== "ok" && !skipBrowserExternal
        ? "Fix: install web-access with `claude plugin marketplace add https://github.com/eze-is/web-access` and `claude plugin install web-access@web-access --scope user`."
        : "",
      deep && routeHealth && !routeHealth.ok
        ? "Fix: verify Claude Code auth, provider API key/base URL, and model/effort values; rerun with `dragonboat doctor --deep --model <model> --effort <effort>`."
        : "",
      ""
    ]
      .filter((line) => line !== "")
      .join("\n")
  );
  deps.stdout.write("\n");

  return bootstrapOk && api.ok && web.ok && browserOk && routeOk ? 0 : 1;
}

async function releaseCheck(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const rootDir = resolve(optionalFlag(flags, "root", REPO_ROOT));
  const format = optionalFlag(flags, "format", "text");
  const report = checkReleaseReadiness(rootDir);

  if (format === "json") {
    deps.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    deps.stdout.write(formatReleaseReadinessReport(report));
  }

  return report.status === "passed" ? 0 : 1;
}

async function deck(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const requestedApiPort = Number.parseInt(optionalFlag(flags, "api-port", String(parsePortFromUrl(apiUrl(deps.env), 8787))), 10);
  const requestedWebPort = Number.parseInt(optionalFlag(flags, "web-port", String(parsePortFromUrl(webUrl(deps.env), 5173))), 10);
  const apiPort = flags.has("api-port")
    ? requestedApiPort
    : await findAvailablePort(Number.isFinite(requestedApiPort) ? requestedApiPort : 8787, deps.portAvailable);
  const webPort = flags.has("web-port")
    ? requestedWebPort
    : await findAvailablePort(Number.isFinite(requestedWebPort) ? requestedWebPort : 5173, deps.portAvailable);
  const apiBase = localUrl(apiPort);
  const webBase = localUrl(webPort);

  if (flags.has("api-port")) {
    const apiPortUsable = await explicitDeckPortIsUsable(deps, apiPort, "API", `${apiBase}/api/health`, '"status":"ok"');

    if (!apiPortUsable) {
      return 1;
    }
  }

  if (flags.has("web-port")) {
    const webPortUsable = await explicitDeckPortIsUsable(deps, webPort, "Web", webBase, "DragonBoat Crew Run");

    if (!webPortUsable) {
      return 1;
    }
  }

  installBootstrapKit(workspaceRoot);

  const apiProcess = deps.spawnBackground("npm", ["run", "dev:api", "-w", "@dragonboat/demo-web"], {
    cwd: REPO_ROOT,
    env: {
      ...deps.env,
      DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot,
      PORT: String(apiPort)
    }
  });
  const webProcess = deps.spawnBackground("npm", ["run", "dev:web", "-w", "@dragonboat/demo-web", "--", "--host", "127.0.0.1", "--port", String(webPort)], {
    cwd: REPO_ROOT,
    env: {
      ...deps.env,
      DRAGONBOAT_API_URL: apiBase,
      DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot,
      VITE_DRAGONBOAT_API_URL: apiBase
    }
  });

  deps.stdout.write(
    [
      "DragonBoat command deck",
      `workspace: ${workspaceRoot}`,
      `API: ${apiBase}${apiProcess.pid ? ` (pid ${apiProcess.pid})` : ""}`,
      `Web: ${webBase}${webProcess.pid ? ` (pid ${webProcess.pid})` : ""}`,
      "",
      `Use this for foreground steering: DRAGONBOAT_API_URL=${apiBase} DRAGONBOAT_WEB_URL=${webBase} dragonboat steer --workspace ${workspaceRoot}`,
      ""
    ].join("\n")
  );

  if (flags.has("open") && !flags.has("no-open")) {
    await deps.openUrl(webBase);
  }

  return 0;
}

function findWebAccessSkillDir(env: Record<string, string | undefined>) {
  const home = env.HOME?.trim();
  if (!home) {
    return undefined;
  }

  const marketplaceDir = join(home, ".claude", "plugins", "marketplaces", "web-access");
  if (existsSync(join(marketplaceDir, "scripts", "check-deps.mjs"))) {
    return marketplaceDir;
  }

  const cacheRoot = join(home, ".claude", "plugins", "cache", "web-access", "web-access");
  if (existsSync(cacheRoot)) {
    const versions = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(cacheRoot, entry.name))
      .sort()
      .reverse();
    return versions.find((entry) => existsSync(join(entry, "scripts", "check-deps.mjs")));
  }

  return undefined;
}

function checkClaudeWebAccessPlugin(env: Record<string, string | undefined>) {
  const result = spawnSync("claude", ["plugin", "list"], {
    encoding: "utf8"
  });
  const skillDir = findWebAccessSkillDir(env);

  if (result.error) {
    return {
      detail: result.error.message,
      skillDir,
      status: "failed"
    };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    return {
      detail: output.trim() || `claude plugin list exited ${result.status}`,
      skillDir,
      status: "failed"
    };
  }

  return {
    detail: output.includes("web-access") ? "web-access plugin is visible" : "web-access plugin not found in claude plugin list",
    skillDir,
    status: output.includes("web-access") ? "ok" : "missing"
  };
}

function runWebAccessCheckDeps(skillDir: string, browser?: string) {
  const args = [join(skillDir, "scripts", "check-deps.mjs")];
  if (browser) {
    args.push("--browser", browser);
  }
  const result = spawnSync("node", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_SKILL_DIR: skillDir
    },
    timeout: 30_000
  });

  const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();

  if (result.error) {
    return {
      detail: result.error.message,
      status: "failed"
    };
  }

  if (result.status === 0) {
    return {
      detail: detail || "web-access dependency check passed",
      status: "ok"
    };
  }

  return {
    detail: detail || `web-access dependency check exited ${result.status}`,
    status: "failed"
  };
}

async function checkCdpHealth(fetcher: Fetcher, cdpUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetcher(cdpUrl, {
      signal: controller.signal
    });
    return {
      detail: response.ok ? cdpUrl : `${cdpUrl} returned ${response.status}`,
      status: response.ok ? "ok" : "failed"
    };
  } catch (cause) {
    return {
      detail: cause instanceof Error ? cause.message : String(cause),
      status: "failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function browserDoctor(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || "run_browser_doctor";
  const cdpUrl = optionalFlag(flags, "cdp-url", "http://127.0.0.1:3456/health");
  const skipExternal = flags.has("skip-external");
  const browser = flags.get("browser")?.trim();
  const artifactDir = join(workspaceRoot, ".dragonboat", "browser-artifacts", runId);
  let artifactsWritable = false;
  let artifactDetail = "";

  try {
    ensureDir(artifactDir);
    writeFileSync(join(artifactDir, ".keep"), "");
    artifactsWritable = true;
    artifactDetail = artifactDir;
  } catch (cause) {
    artifactDetail = cause instanceof Error ? cause.message : String(cause);
  }

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const nodeStatus = Number.isFinite(nodeMajor) && nodeMajor >= 22 ? "ok" : "failed";
  const webAccess = skipExternal
    ? {
        detail: "external checks skipped",
        skillDir: undefined,
        status: "skipped"
      }
    : checkClaudeWebAccessPlugin(deps.env);
  const checkDeps =
    skipExternal || webAccess.status !== "ok" || !webAccess.skillDir
      ? {
          detail: skipExternal ? "external checks skipped" : "web-access skill directory not found",
          status: skipExternal ? "skipped" : "failed"
        }
      : runWebAccessCheckDeps(webAccess.skillDir, browser);
  const cdp = skipExternal
    ? {
        detail: "external checks skipped",
        status: "skipped"
      }
    : checkDeps.status === "ok"
      ? await checkCdpHealth(deps.fetcher, cdpUrl)
      : {
          detail: checkDeps.detail,
          status: "failed"
        };

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      artifactDir,
      artifactsWritable,
      cdp: cdp.status,
      cdpDetail: cdp.detail,
      cdpUrl,
      checkDeps: checkDeps.status,
      checkDepsDetail: checkDeps.detail,
      nodeMajorOk: nodeStatus === "ok",
      nodeVersion: process.versions.node,
      webAccess: webAccess.status,
      webAccessDetail: webAccess.detail
    },
    runId,
    type: "browser.capability.checked"
  });

  deps.stdout.write(
    [
      "DragonBoat browser doctor",
      `workspace: ${workspaceRoot}`,
      `artifacts: ${artifactsWritable ? "ok" : `failed (${artifactDetail})`}`,
      `node: ${nodeStatus} (${process.versions.node})`,
      `web-access: ${webAccess.status}${webAccess.detail ? ` (${webAccess.detail})` : ""}`,
      `check-deps: ${checkDeps.status}${checkDeps.detail ? ` (${checkDeps.detail.split(/\r?\n/g).at(-1)})` : ""}`,
      `cdp: ${cdp.status}${cdp.detail ? ` (${cdp.detail})` : ""}`,
      "",
      cdp.status === "failed"
        ? "CDP is not reachable. Open chrome://inspect/#remote-debugging or edge://inspect/#remote-debugging, enable remote debugging, then retry."
        : ""
    ]
      .filter(Boolean)
      .join("\n")
  );
  deps.stdout.write("\n");

  return artifactsWritable && nodeStatus === "ok" && (skipExternal || (webAccess.status === "ok" && cdp.status === "ok")) ? 0 : 1;
}

async function reconcileRun(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || latestRunId(workspaceRoot);

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      source: "cli",
      workspaceRoot
    },
    runId,
    type: "run.reconciled"
  });

  try {
    await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/reconcile`, {});
    deps.stdout.write(`Reconciled ${runId} with DragonBoat API\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    deps.stdout.write(`Recorded reconcile for ${runId} via local ledger fallback\n`);
  }

  return 0;
}

async function browserSmoke(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || "run_browser_smoke";
  const url = optionalFlag(flags, "url", "http://127.0.0.1:5173");
  const model = optionalFlag(flags, "model", "kimi-k2.6");
  const effort = optionalFlag(flags, "effort", "max");
  const screenshotPath = resolve(
    workspaceRoot,
    optionalFlag(flags, "screenshot", join(".dragonboat", "browser-artifacts", runId, "web-access-smoke.png"))
  );
  const eventsFile = eventsPathForRun(workspaceRoot, runId);
  const doctorExit = await browserDoctor(["--workspace", workspaceRoot, "--run", runId, ...(flags.get("browser") ? ["--browser", flags.get("browser") ?? ""] : [])], deps);

  if (doctorExit !== 0) {
    return doctorExit;
  }

  ensureDir(dirname(screenshotPath));
  appendLocalEvent(eventsFile, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      agentId: "agent_browser_smoke",
      fallback: "block_if_unhealthy",
      model,
      reason: "Browser/CDP visual smoke uses Kimi multimodal route.",
      requiredCapabilities: ["browser_research", "vision"],
      role: "browser_research",
      taskId: "task_browser_smoke"
    },
    runId,
    taskId: "task_browser_smoke",
    type: "route.decision.recorded"
  });

  const prompt = [
    "你是 DragonBoat 的 browser_research smoke rower。",
    "必须加载并遵循 web-access skill。不要修改任何项目文件。",
    "每个 Bash 命令必须保持单一操作，不要使用管道、重定向或复合命令。",
    `请通过 web-access/CDP 打开 ${url}。`,
    `请把截图保存到 ${screenshotPath}。`,
    `截图保存后，请用 Read 工具读取 ${screenshotPath} 并进行视觉识别。`,
    "请用中文自然语言总结截图中是否能看到：DragonBoat logo、Agent 关系图、左侧 session rail。",
    "如果 web-access、CDP、截图或多模态识别不可用，请明确输出 blocker 原因，不要伪造通过。"
  ].join("\n");
  const commandArgs = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--effort",
    effort,
    "--permission-mode",
    process.env.DRAGONBOAT_BROWSER_SMOKE_PERMISSION_MODE ?? "auto",
    "--allowedTools=Skill,Read,Write,Bash(node *),Bash(curl *),Bash(mkdir *),Bash(ls *)",
    prompt
  ];

  appendLocalEvent(eventsFile, {
    actor: "agent_browser_smoke",
    createdAt: new Date().toISOString(),
    payload: {
      agentId: "agent_browser_smoke",
      args: commandArgs.slice(0, -1),
      command: "claude"
    },
    runId,
    taskId: "task_browser_smoke",
    type: "command.started"
  });

  const result = spawnSync("claude", commandArgs, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...deps.env,
      DRAGONBOAT_RUN_ID: runId,
      DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
    },
    timeout: 180_000
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const logPath = join(workspaceRoot, ".dragonboat", "runs", runId, "logs", "agent_browser_smoke.log");
  ensureDir(dirname(logPath));
  writeFileSync(logPath, `${output}\n`);

  for (const line of output.split(/\r?\n/g).filter(Boolean).slice(-20)) {
    appendLocalEvent(eventsFile, {
      actor: "agent_browser_smoke",
      createdAt: new Date().toISOString(),
      payload: {
        agentId: "agent_browser_smoke",
        line
      },
      runId,
      taskId: "task_browser_smoke",
      type: "command.output"
    });
  }

  appendLocalEvent(eventsFile, {
    actor: "agent_browser_smoke",
    createdAt: new Date().toISOString(),
    payload: {
      agentId: "agent_browser_smoke",
      exitCode: typeof result.status === "number" ? result.status : 1,
      signal: result.signal ?? null
    },
    runId,
    taskId: "task_browser_smoke",
    type: "command.finished"
  });

  const screenshotExists = existsSync(screenshotPath);
  appendLocalEvent(eventsFile, {
    actor: "agent_browser_smoke",
    createdAt: new Date().toISOString(),
    payload: {
      commandsRun: [`claude ${commandArgs.slice(0, -1).join(" ")} <browser-smoke-prompt>`],
      files: [logPath],
      remainingRisks: screenshotExists ? ["none"] : ["screenshot file was not created"],
      screenshots: screenshotExists ? [screenshotPath] : [],
      sources: [url],
      status: result.status === 0 && screenshotExists ? "passed" : "failed",
      summary: screenshotExists ? "web-access browser smoke produced a screenshot and Claude output." : "web-access browser smoke did not produce a screenshot.",
      taskType: "browser_research",
      title: "web-access browser smoke"
    },
    runId,
    taskId: "task_browser_smoke",
    type: "evidence.submitted"
  });

  deps.stdout.write(output ? `${output}\n` : "");
  deps.stdout.write(`Browser smoke ${result.status === 0 && screenshotExists ? "passed" : "failed"}; screenshot: ${screenshotPath}\n`);
  return result.status === 0 && screenshotExists ? 0 : 1;
}

async function steer(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const projectName = optionalFlag(flags, "project", basename(workspaceRoot) || "DragonBoat project");
  const base = apiUrl(deps.env);

  installBootstrapKit(workspaceRoot);

  let createdNewRun = false;
  let runId = flags.get("run")?.trim();

  if (!runId && !flags.has("new")) {
    runId = await findResumableRun(deps.fetcher, base, workspaceRoot).catch(() => undefined);
  }

  if (runId) {
    await getJson(deps.fetcher, `${base}/api/sessions/${encodeURIComponent(runId)}`).catch(() => undefined);
    deps.stdout.write(`DragonBoat session ${runId} resumed for ${workspaceRoot}\n`);
  } else {
    const registered = await postJson<SteererRegisterResponse>(deps.fetcher, `${base}/api/steerer/register`, {
      projectName,
      steererPid: deps.pid,
      workspaceRoot
    });
    createdNewRun = true;
    runId = registered.runId ?? registered.session?.runId;
  }

  if (!runId) {
    throw new Error("DragonBoat API did not return a run id.");
  }

  if (createdNewRun) {
    deps.stdout.write(`DragonBoat session ${runId} is steering ${workspaceRoot}\n`);
  }

  if (flags.has("open") && !flags.has("no-open")) {
    await deps.openUrl(webUrl(deps.env));
  }

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      required: true,
      reason: "dragonboat steer requires an explicit agentic mode assessment before launching rowers"
    },
    runId,
    type: "agentic.mode.required"
  });

  return deps.spawnForeground("codex", ["-C", workspaceRoot], {
    cwd: workspaceRoot,
    env: {
      ...deps.env,
      DRAGONBOAT_API_URL: base,
      DRAGONBOAT_RUN_ID: runId,
      DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

async function startRower(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const workspaceRoot = workspaceRootFromDeps(deps);
  const promptFile = requireFlag(flags, "prompt-file");
  const role = requireFlag(flags, "role");
  if (!flags.has("skip-mode-check")) {
    requireAgenticModeBeforeRowerStart(workspaceRoot, runId);
  }
  const prompt = readWorkspaceRelativeFile(deps, workspaceRoot, promptFile);
  const route = mergeRouteWithRecommendation(readRoutingPolicy(workspaceRoot), extractTaskPacketRoute(prompt), role);
  const body = {
    agentId: requireFlag(flags, "id"),
    newWave: flags.has("new-wave"),
    prompt,
    ...(route ? { route } : {}),
    role
  };

  await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers`, body);
  deps.stdout.write(`Started ${body.agentId} for ${runId}\n`);
  return 0;
}

async function recommendRowerRoute(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const role = requireFlag(flags, "role");
  const capabilities = splitFlagList(flags.get("capability") ?? flags.get("capabilities"));
  const format = optionalFlag(flags, "format", "task-packet");
  const route = recommendRoute(readRoutingPolicy(workspaceRoot), {
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    role
  });

  if (format === "json") {
    deps.stdout.write(`${JSON.stringify(route, null, 2)}\n`);
  } else {
    deps.stdout.write(formatRouteForTaskPacket(route));
  }

  return 0;
}

function parseJsonValues<T>(values: string[], label: string): T[] {
  return values.map((value, index) => {
    try {
      return JSON.parse(value) as T;
    } catch (cause) {
      throw new Error(`${label} #${index + 1} must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  });
}

function formatBudgetRouteMarkdown(decision: ReturnType<typeof selectBudgetAwareRoute>) {
  const lines = [
    "# Budget-Aware Route",
    "",
    `- Status: \`${decision.status}\``,
    `- Estimated cost: \`${decision.estimatedCostUsd.toFixed(6)}\``,
    ""
  ];

  if (decision.selected) {
    lines.push(
      "## Selected",
      "",
      `- Model: \`${decision.selected.model}\``,
      `- Effort: \`${decision.selected.effort ?? "provider_default"}\``,
      `- Provider: \`${decision.selected.provider}\``,
      ""
    );
  }

  if (decision.rejected.length > 0) {
    lines.push("## Rejected", "");
    for (const rejected of decision.rejected) {
      lines.push(`- \`${rejected.model}\`: ${rejected.reasons.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function assessBudgetRoute(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const format = optionalFlag(flags, "format", "markdown");
  if (format !== "markdown" && format !== "json") {
    throw new Error("Route budget --format must be markdown or json.");
  }

  const candidates = parseJsonValues<ModelRouteCandidate>(multiFlagValues(argv, "candidate"), "--candidate");
  const subscriptions = parseJsonValues<SubscriptionBudget>(multiFlagValues(argv, "subscription"), "--subscription");

  if (candidates.length === 0) {
    throw new Error("Route budget requires at least one --candidate JSON object.");
  }

  const decision = selectBudgetAwareRoute({
    candidates: candidates.map((candidate) => {
      const record = candidate as ModelRouteCandidate & {
        effort?: string;
        maxConcurrency?: number;
        pricePer1kInputUsd?: number;
        pricePer1kOutputUsd?: number;
      };
      return {
        ...record,
        pricePer1kInput: record.pricePer1kInput ?? record.pricePer1kInputUsd ?? 0,
        pricePer1kOutput: record.pricePer1kOutput ?? record.pricePer1kOutputUsd ?? 0,
        subscriptionId: record.subscriptionId ?? record.model
      };
    }),
    requirements: {
      maxEstimatedCostUsd: numberFlag(flags, "max-cost-usd"),
      qualityRiskTolerance: numberFlag(flags, "max-quality-risk"),
      requiredCapabilities: multiFlagValues(argv, "capability"),
      taskClass: optionalFlag(flags, "task-class", "general"),
      tokenEstimate: {
        input: numberFlag(flags, "estimated-input-tokens") ?? 0,
        output: numberFlag(flags, "estimated-output-tokens") ?? 0
      }
    },
    subscriptions: subscriptions.map((subscription) => {
      const record = subscription as SubscriptionBudget & {
        activeConcurrency?: number;
        maxConcurrency?: number;
        model?: string;
        remainingBudgetUsd?: number;
        remainingUsd?: number;
        usedConcurrency?: number;
      };
      return {
        ...record,
        id: record.id ?? record.model ?? "",
        maxConcurrency: record.maxConcurrency ?? Number.POSITIVE_INFINITY,
        remainingUsd: record.remainingUsd ?? record.remainingBudgetUsd,
        usedConcurrency: record.usedConcurrency ?? record.activeConcurrency ?? 0
      };
    })
  });
  const content = format === "json" ? `${JSON.stringify(decision, null, 2)}\n` : `${formatBudgetRouteMarkdown(decision)}\n`;
  writeTextOutput(flags.get("out"), deps.cwd(), content);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: decision as unknown as Record<string, unknown>,
      runId: activeRun.runId,
      type: "budget.route.assessed"
    });
  }

  deps.stdout.write(content);
  return decision.status === "selected" ? 0 : decision.status === "human_approval_required" ? 3 : 1;
}

async function eventSourceFromArgs(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  return {
    events,
    flags,
    runId: runIdFromEvents(events, source.runId),
    source
  };
}

async function printCapabilityMatrix(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const { events, flags, runId, source } = await eventSourceFromArgs(argv, deps);
  const matrix = buildCapabilityMatrix(events);
  const content = `${JSON.stringify(matrix, null, 2)}\n`;
  writeTextOutput(flags.get("out"), deps.cwd(), content);
  appendLocalEvent(source.eventsPath, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      agentCount: Object.keys(matrix.agents).length,
      modelCount: Object.keys(matrix.models).length
    },
    runId,
    type: "capability.matrix.updated"
  });
  deps.stdout.write(content);
  return 0;
}

async function printCostTrace(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const { events, flags, runId, source } = await eventSourceFromArgs(argv, deps);
  const trace = createCostTrace(events);
  const content = `${JSON.stringify(trace, null, 2)}\n`;
  writeTextOutput(flags.get("out"), deps.cwd(), content);
  appendLocalEvent(source.eventsPath, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      totalEstimatedCostUsd: trace.totalEstimatedCostUsd,
      wastedEstimatedCostUsd: trace.wastedEstimatedCostUsd,
      wasteCount: trace.wasteItems.length
    },
    runId,
    type: "cost.trace.recorded"
  });
  deps.stdout.write(content);
  return 0;
}

function parseBooleanFlag(flags: Map<string, string>, name: string, fallback = false) {
  const value = flags.get(name)?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return value === "1" || value === "true" || value === "yes";
}

function writeJsonOrMarkdown(flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>, json: unknown, markdown: string) {
  const format = optionalFlag(flags, "format", "markdown");
  if (format !== "json" && format !== "markdown") {
    throw new Error("--format must be markdown or json.");
  }
  const content = format === "json" ? `${JSON.stringify(json, null, 2)}\n` : `${markdown}\n`;
  writeTextOutput(flags.get("out"), deps.cwd(), content);
  deps.stdout.write(content);
}

function formatComputePlacementMarkdown(plan: ReturnType<typeof planComputePlacement>) {
  const lines = [
    "# Compute Placement Plan",
    "",
    `- Status: \`${plan.status}\``,
    `- Local only: \`${String(plan.localOnly)}\``,
    `- Estimated cost: \`${Number.isFinite(plan.estimatedCostUsd) ? plan.estimatedCostUsd.toFixed(4) : "n/a"}\``,
    ""
  ];

  if (plan.selected) {
    lines.push("## Selected", "", `- Worker: \`${plan.selected.id}\``, `- Kind: \`${plan.selected.kind}\``, "");
  }
  if (plan.rejected.length > 0) {
    lines.push("## Rejected", "");
    for (const rejected of plan.rejected) {
      lines.push(`- \`${rejected.id}\`: ${rejected.reasons.join(", ")}`);
    }
  }
  return lines.join("\n");
}

async function planCompute(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workers = parseJsonValues<ComputeWorker>(multiFlagValues(argv, "worker"), "--worker");
  if (workers.length === 0) {
    throw new Error("Compute plan requires at least one --worker JSON object.");
  }
  const requirements: ComputeTaskRequirements = {
    allowRemote: parseBooleanFlag(flags, "allow-remote"),
    estimatedMinutes: numberFlag(flags, "estimated-minutes"),
    maxCostUsd: numberFlag(flags, "max-cost-usd"),
    maxLatencyMs: numberFlag(flags, "max-latency-ms"),
    privacyClass: optionalFlag(flags, "privacy-class", "private_code"),
    requiredCapabilities: multiFlagValues(argv, "capability")
  };
  const plan = planComputePlacement({ requirements, workers });
  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        plan,
        requirements,
        workerCount: workers.length
      },
      runId: activeRun.runId,
      type: "compute.placement.planned"
    });
  }

  writeJsonOrMarkdown(flags, deps, plan, formatComputePlacementMarkdown(plan));
  return plan.status === "selected" ? 0 : plan.status === "human_approval_required" ? 3 : 1;
}

function privacyFilesFromFlags(argv: string[], deps: Required<DragonBoatCliDependencies>): PrivacyRouteFile[] {
  const flags = parseFlags(argv);
  const files = multiFlagValues(argv, "file").map((filePath) => {
    const absolutePath = resolve(deps.cwd(), filePath);
    return {
      content: deps.readFile(absolutePath),
      path: relative(deps.cwd(), absolutePath) || basename(absolutePath)
    };
  });
  const content = flags.get("content");
  if (content !== undefined) {
    files.push({
      content,
      path: optionalFlag(flags, "path", "inline.txt")
    });
  }
  return files;
}

async function privacyScan(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const findings = privacyFilesFromFlags(argv, deps).flatMap((file) => scanSecrets(file.path, file.content ?? ""));
  writeJsonOrMarkdown(flags, deps, { findings }, `# Privacy Scan\n\n- Findings: \`${findings.length}\``);
  return findings.length > 0 ? 1 : 0;
}

async function privacyRoute(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const files = privacyFilesFromFlags(argv, deps);
  if (files.length === 0) {
    throw new Error("Privacy route requires --file <path> or --content <text>.");
  }
  const assessment = assessPrivacyRoute({
    files,
    policy: DEFAULT_PRIVACY_POLICY,
    provider: optionalFlag(flags, "provider", "local_model")
  });
  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        decision: assessment.decision,
        fileCount: assessment.files.length,
        provider: assessment.provider,
        reasons: assessment.reasons,
        secretCount: assessment.secretFindings.length
      },
      runId: activeRun.runId,
      type: "privacy.route.assessed"
    });
  }
  writeJsonOrMarkdown(
    flags,
    deps,
    assessment,
    [
      "# Privacy Route Assessment",
      "",
      `- Decision: \`${assessment.decision}\``,
      `- Provider: \`${assessment.provider}\``,
      `- Secrets: \`${assessment.secretFindings.length}\``,
      `- Reasons: ${assessment.reasons.join(", ") || "none"}`
    ].join("\n")
  );
  return assessment.decision === "blocked" ? 1 : 0;
}

async function privacyRedact(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const filePath = flags.get("file")?.trim();
  const content = filePath ? deps.readFile(resolve(deps.cwd(), filePath)) : requireFlag(flags, "content");
  const redacted = redactSecrets(content);
  writeTextOutput(flags.get("out"), deps.cwd(), redacted);
  deps.stdout.write(redacted.endsWith("\n") ? redacted : `${redacted}\n`);
  return 0;
}

function readBenchmarkRecords(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  return multiFlagValues(argv, "benchmark").map(
    (benchmarkPath) => JSON.parse(deps.readFile(resolve(deps.cwd(), benchmarkPath))) as BenchmarkRecord
  );
}

async function adviseSubscriptions(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const subscriptions = parseJsonValues<SubscriptionInventoryItem>(multiFlagValues(argv, "subscription"), "--subscription");
  if (subscriptions.length === 0) {
    throw new Error("Subscription advise requires at least one --subscription JSON object.");
  }

  let events: DemoEvent[] = [];
  let source: AcceptanceRunSource | null = null;
  if (flags.has("events") || flags.has("latest") || flags.has("run")) {
    const result = await eventSourceFromArgs(argv, deps);
    events = result.events;
    source = result.source;
  }
  const report = createSubscriptionAdvisorReport({
    benchmarkRecords: readBenchmarkRecords(argv, deps),
    capabilityMatrix: events.length > 0 ? buildCapabilityMatrix(events) : undefined,
    costTrace: events.length > 0 ? createCostTrace(events) : undefined,
    subscriptions
  });
  const activeRun = source ? { eventsPath: source.eventsPath, runId: runIdFromEvents(events, source.runId) } : optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: report as unknown as Record<string, unknown>,
      runId: activeRun.runId,
      type: "subscription.advice.generated"
    });
  }
  writeJsonOrMarkdown(
    flags,
    deps,
    report,
    [
      "# Subscription Advice",
      "",
      `- Estimated monthly savings: \`$${report.estimatedMonthlySavingsUsd.toFixed(2)}\``,
      `- Summary: ${report.summary}`,
      "",
      ...report.recommendations.map((item) => `- \`${item.id}\`: ${item.action} (${item.reason})`)
    ].join("\n")
  );
  return 0;
}

function parseMarketplaceKind(value: string | undefined): MarketplacePackKind | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "adapter" || value === "eval_suite" || value === "role_pack" || value === "tool_gateway" || value === "workflow_pack") {
    return value;
  }
  throw new Error("Marketplace --kind must be adapter, eval_suite, role_pack, tool_gateway, or workflow_pack.");
}

async function handleMarketplace(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const [action = "list", ...rest] = argv;
  const flags = parseFlags(rest);

  if (action === "list") {
    const packs = listMarketplacePacks({
      capability: flags.get("capability")?.trim(),
      kind: parseMarketplaceKind(flags.get("kind")?.trim())
    });
    deps.stdout.write(`${JSON.stringify(packs, null, 2)}\n`);
    return 0;
  }

  const packId = requireFlag(flags, "pack");
  if (action === "show") {
    deps.stdout.write(`${JSON.stringify(getMarketplacePack(packId), null, 2)}\n`);
    return 0;
  }

  if (action === "install") {
    const outputPath = resolve(deps.cwd(), flags.get("out")?.trim() || join(".dragonboat", "marketplace", `${packId}.json`));
    const record = createMarketplaceInstallRecord({
      installedAt: new Date().toISOString(),
      manifestPath: outputPath,
      packId
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
    const activeRun = optionalEventsPathForActiveRun(deps);
    if (activeRun) {
      appendLocalEvent(activeRun.eventsPath, {
        actor: "agent_codex",
        createdAt: record.installedAt,
        payload: {
          manifestPath: outputPath,
          packId,
          packKind: record.pack.kind,
          version: record.pack.version
        },
        runId: activeRun.runId,
        type: "marketplace.pack.installed"
      });
    }
    deps.stdout.write(`Installed marketplace pack ${packId} at ${outputPath}\n`);
    return 0;
  }

  throw new Error("Unknown marketplace action. Use list, show, or install.");
}

async function learnCapability(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const { events, flags, runId, source } = await eventSourceFromArgs(argv, deps);
  const report = learnCapabilitiesFromTrace({
    events,
    minimumAttempts: numberFlag(flags, "minimum-attempts")
  });
  const content = `${JSON.stringify(report, null, 2)}\n`;
  writeTextOutput(flags.get("out"), deps.cwd(), content);
  appendLocalEvent(source.eventsPath, {
    actor: "agent_codex",
    createdAt: report.generatedAt,
    payload: {
      learnedCount: report.learned.length,
      minimumAttempts: report.minimumAttempts,
      preferred: report.learned.filter((item) => item.recommendation === "prefer").map((item) => item.entityId),
      avoided: report.learned.filter((item) => item.recommendation === "avoid").map((item) => item.entityId)
    },
    runId,
    type: "capability.learning.updated"
  });
  deps.stdout.write(content);
  return 0;
}

async function setRowerRoute(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const agentId = requireFlag(flags, "agent");
  const role = optionalFlag(flags, "role", agentId.replace(/^agent_/, ""));
  const capabilities = splitFlagList(flags.get("capability") ?? flags.get("capabilities"));
  const recommended = recommendRoute(readRoutingPolicy(workspaceRootFromDeps(deps)), {
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    role
  });
  const route = {
    ...recommended,
    effort: flags.get("effort")?.trim() || recommended.effort,
    model: flags.get("model")?.trim() || recommended.model,
    reason: flags.get("reason")?.trim() || recommended.reason,
    role
  };

  await postJson(
    deps.fetcher,
    `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/agents/${encodeURIComponent(agentId)}/config`,
    {
      effort: route.effort,
      model: route.model
    },
    "PATCH"
  );
  deps.stdout.write(`Synced ${agentId} route for ${runId}\n${formatRouteForTaskPacket(route)}`);
  return 0;
}

async function stopRower(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const agentId = requireFlag(flags, "id");

  try {
    await postJson(
      deps.fetcher,
      `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}`,
      {},
      "DELETE"
    );
    deps.stdout.write(`Stopped ${agentId} for ${runId}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        agentId,
        deliveryMode: "local_ledger",
        deliveryStatus: "not_injected",
        error: cause instanceof Error ? cause.message : String(cause)
      },
      runId,
      type: "rower.stop.requested"
    });
    deps.stdout.write(`Recorded stop request for ${agentId} via local ledger fallback\n`);
  }
  return 0;
}

function resolveRunForRowerCommand(flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>) {
  if (flags.has("latest")) {
    return latestRunId(workspaceRootFromDeps(deps));
  }

  return flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || latestRunId(workspaceRootFromDeps(deps));
}

async function listRowers(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = resolveRunForRowerCommand(flags, deps);
  const body = await getJson<{ rowers?: Array<Record<string, unknown>> }>(
    deps.fetcher,
    `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers`
  );
  const rowers = body.rowers ?? [];

  if (flags.get("format") === "json") {
    deps.stdout.write(`${JSON.stringify({ rowers, runId }, null, 2)}\n`);
    return 0;
  }

  deps.stdout.write(`DragonBoat rowers for ${runId}\n`);
  for (const rower of rowers) {
    const attach = rower.attach as { canInject?: boolean; activeTakeover?: { operator?: string } } | undefined;
    const checkpoint = rower.checkpoint as { summary?: string; timestamp?: string } | undefined;
    deps.stdout.write(
      [
        `- ${String(rower.id ?? "")}`,
        `status=${String(rower.status ?? "unknown")}`,
        `role=${String(rower.role ?? "unknown")}`,
        attach?.canInject === false ? `接管中=${attach.activeTakeover?.operator ?? "human"}` : "可进入",
        checkpoint?.summary ? `检查点=${checkpoint.summary}` : "无检查点"
      ].join("  ")
    );
    deps.stdout.write("\n");
  }

  return 0;
}

async function attachRower(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = resolveRunForRowerCommand(flags, deps);
  const agentId = requireFlag(flags, "agent");
  const mode = optionalFlag(flags, "mode", "view");
  const started = await postJson<{
    buffer?: string[];
    session: {
      id: string;
      mode: string;
    };
  }>(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}/attach`, {
    mode,
    operator: optionalFlag(flags, "operator", "human")
  });

  deps.stdout.write(`已进入 ${agentId}（${started.session.mode}）。退出快捷键：Ctrl-]\n`);
  for (const chunk of started.buffer ?? []) {
    deps.stdout.write(chunk);
  }

  const text = flags.get("text") ?? "";
  if (text) {
    await postJson(
      deps.fetcher,
      `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}/attach/input`,
      {
        sessionId: started.session.id,
        text: text.endsWith("\r") || text.endsWith("\n") ? text : `${text}\r`
      }
    );
    deps.stdout.write(`已向 ${agentId} 发送协助输入。\n`);
  }

  if (flags.has("end")) {
    await postJson(
      deps.fetcher,
      `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}/attach/end`,
      {
        sessionId: started.session.id
      }
    );
  }

  if (!text && !flags.has("end") && !flags.has("no-follow") && process.stdin.isTTY && process.stdout.isTTY) {
    await followAttachedRower({
      agentId,
      deps,
      mode,
      runId,
      sessionId: started.session.id
    });
  }

  return 0;
}

async function followAttachedRower(input: {
  agentId: string;
  deps: Required<DragonBoatCliDependencies>;
  mode: string;
  runId: string;
  sessionId: string;
}) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = stdin.isRaw;
  const terminalUrl = new URL(
    `/api/attach/${encodeURIComponent(input.runId)}/${encodeURIComponent(input.agentId)}`,
    apiUrl(input.deps.env)
  );
  terminalUrl.protocol = terminalUrl.protocol === "https:" ? "wss:" : "ws:";
  terminalUrl.searchParams.set("mode", input.mode);
  terminalUrl.searchParams.set("sessionId", input.sessionId);

  const socket = new WebSocket(terminalUrl);

  await new Promise<void>((resolveFollow, rejectFollow) => {
    let settled = false;
    let ending = false;
    const restore = () => {
      stdin.off("data", onInput);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(wasRaw);
      }
    };
    const endAttach = async () => {
      if (ending) {
        return;
      }
      ending = true;
      restore();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      await postJson(
        input.deps.fetcher,
        `${apiUrl(input.deps.env)}/api/sessions/${encodeURIComponent(input.runId)}/rowers/${encodeURIComponent(input.agentId)}/attach/end`,
        {
          sessionId: input.sessionId
        }
      ).catch((cause) => {
        input.deps.stderr.write(`\n[dragonboat] attach end failed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
      });
      stdout.write("\n已退出划手进入模式。\n");
      if (!settled) {
        settled = true;
        resolveFollow();
      }
    };
    const onInput = (chunk: Buffer) => {
      if (chunk.includes(0x1d)) {
        void endAttach();
        return;
      }
      if (input.mode === "view") {
        return;
      }
      void postJson(
        input.deps.fetcher,
        `${apiUrl(input.deps.env)}/api/sessions/${encodeURIComponent(input.runId)}/rowers/${encodeURIComponent(input.agentId)}/attach/input`,
        {
          sessionId: input.sessionId,
          text: chunk.toString("utf8")
        }
      ).catch((cause) => {
        input.deps.stderr.write(`\n[dragonboat] input failed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
      });
    };

    socket.on("message", (data) => {
      stdout.write(data.toString());
    });
    socket.on("open", () => {
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.on("data", onInput);
    });
    socket.on("error", (cause) => {
      restore();
      if (!settled) {
        settled = true;
        rejectFollow(cause);
      }
    });
    socket.on("close", () => {
      if (!ending) {
        void endAttach();
      }
    });
  });
}

async function releaseRower(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = resolveRunForRowerCommand(flags, deps);
  const agentId = requireFlag(flags, "agent");
  await postJson(
    deps.fetcher,
    `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}/release`,
    {}
  );
  deps.stdout.write(`已释放 ${agentId} 的接管锁。\n`);
  return 0;
}

function safeCheckpointSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function latestCheckpointPath(workspaceRoot: string, agentId: string) {
  return join(workspaceRoot, ".dragonboat", "checkpoints", `${safeCheckpointSegment(agentId)}.current.json`);
}

function writeLocalCheckpoint(workspaceRoot: string, runId: string, checkpoint: RowerCheckpoint) {
  const checkpointsDir = join(workspaceRoot, ".dragonboat", "checkpoints");
  const historyDir = join(localRunsDir(workspaceRoot), runId, "checkpoints", safeCheckpointSegment(checkpoint.agentId));
  const timestamp = safeCheckpointSegment(checkpoint.timestamp.replace(/[:]/g, "-"));
  mkdirSync(checkpointsDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });

  const json = `${JSON.stringify(checkpoint, null, 2)}\n`;
  const markdown = formatRowerCheckpointMarkdown(checkpoint);
  const latestJson = latestCheckpointPath(workspaceRoot, checkpoint.agentId);
  const latestMarkdown = join(checkpointsDir, `${safeCheckpointSegment(checkpoint.agentId)}.current.md`);
  const historyJson = join(historyDir, `${timestamp}.json`);
  const historyMarkdown = join(historyDir, `${timestamp}.md`);

  writeFileSync(latestJson, json);
  writeFileSync(latestMarkdown, markdown);
  writeFileSync(historyJson, json);
  writeFileSync(historyMarkdown, markdown);

  return {
    historyJson,
    historyMarkdown,
    latestJson,
    latestMarkdown
  };
}

function readLocalLatestCheckpoint(workspaceRoot: string, agentId: string) {
  const filePath = latestCheckpointPath(workspaceRoot, agentId);
  if (!existsSync(filePath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const validation = validateRowerCheckpoint(parsed);
  return validation.ok ? validation.checkpoint : undefined;
}

async function handleRowerCheckpoint(action: string | undefined, argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = workspaceRootFromDeps(deps);
  const runId = resolveRunForRowerCommand(flags, deps);
  const agentId = requireFlag(flags, "agent");

  if (action === "create") {
    const checkpoint = createRowerCheckpoint({
      agentId,
      changedFiles: multiFlagValues(argv, "changed-file"),
      currentFocus: optionalFlag(flags, "current-focus", ""),
      decisions: multiFlagValues(argv, "decision"),
      evidencePaths: multiFlagValues(argv, "evidence"),
      handoffPaths: multiFlagValues(argv, "handoff"),
      nextActions: multiFlagValues(argv, "next-action"),
      openQuestions: multiFlagValues(argv, "open-question"),
      risks: multiFlagValues(argv, "risk"),
      runId,
      status: optionalFlag(flags, "status", "running"),
      summary: requireFlag(flags, "summary"),
      taskId: optionalFlag(flags, "task", "task_general"),
      timestamp: optionalFlag(flags, "timestamp", new Date().toISOString())
    });
    const paths = writeLocalCheckpoint(workspaceRoot, runId, checkpoint);
    appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
      actor: agentId,
      createdAt: checkpoint.timestamp,
      payload: {
        ...checkpoint,
        paths
      },
      runId,
      taskId: checkpoint.taskId,
      type: "rower.checkpoint.created"
    });
    deps.stdout.write(`划手状态检查点已创建：${paths.latestMarkdown}\n`);
    return 0;
  }

  if (action === "latest") {
    const checkpoint = readLocalLatestCheckpoint(workspaceRoot, agentId);
    if (!checkpoint) {
      throw new Error(`No valid 划手状态检查点 found for ${agentId}.`);
    }
    deps.stdout.write(flags.get("format") === "json" ? `${JSON.stringify(checkpoint, null, 2)}\n` : formatRowerCheckpointMarkdown(checkpoint));
    return 0;
  }

  if (action === "list") {
    const dir = join(localRunsDir(workspaceRoot), runId, "checkpoints", safeCheckpointSegment(agentId));
    const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort() : [];
    deps.stdout.write(`${files.join("\n")}${files.length ? "\n" : ""}`);
    return 0;
  }

  if (action === "ensure") {
    await readHookInput(flags, deps);
    const checkpoint = readLocalLatestCheckpoint(workspaceRoot, agentId);
    const eventsPath = eventsPathForRun(workspaceRoot, runId);
    if (!checkpoint) {
      appendLocalEvent(eventsPath, {
        actor: agentId,
        createdAt: new Date().toISOString(),
        payload: {
          agentId,
          reason: "No valid 划手状态检查点 found before Claude Code Stop hook."
        },
        runId,
        type: "rower.checkpoint.missing"
      });
      deps.stdout.write(
        JSON.stringify({
          decision: "block",
          message: "缺少有效的划手状态检查点。请先用 dragonboat rower checkpoint create 生成检查点。"
        })
      );
      deps.stdout.write("\n");
      return 1;
    }

    appendLocalEvent(eventsPath, {
      actor: agentId,
      createdAt: new Date().toISOString(),
      payload: checkpoint as unknown as Record<string, unknown>,
      runId,
      taskId: checkpoint.taskId,
      type: "rower.checkpoint.validated"
    });
    deps.stdout.write(`${JSON.stringify({ decision: "allow", agentId, runId })}\n`);
    return 0;
  }

  throw new Error("Usage: dragonboat rower checkpoint create|latest|list|ensure --agent <agentId>");
}

async function sendMessage(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const type = optionalFlag(flags, "type", "instruction");
  if (!MAILBOX_MESSAGE_TYPES.has(type)) {
    throw new Error(`Message type is invalid: ${type}. Run \`dragonboat message send --help\` for supported types.`);
  }
  const body = {
    body: requireFlag(flags, "body"),
    from: optionalFlag(flags, "from", "agent_codex"),
    taskId: optionalFlag(flags, "task", "task_general"),
    to: requireFlag(flags, "to"),
    type
  };

  try {
    await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/messages`, body);
    deps.stdout.write(`Sent ${body.type} to ${body.to}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    const inboxPath = appendLocalInboxFallback(deps, runId, body, cause);
    deps.stdout.write(`Sent ${body.type} to ${body.to} via local inbox fallback: ${inboxPath}\n`);
  }
  return 0;
}

async function broadcastMessage(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const type = optionalFlag(flags, "type", "instruction");
  if (!MAILBOX_MESSAGE_TYPES.has(type)) {
    throw new Error(`Message type is invalid: ${type}. Run \`dragonboat message send --help\` for supported types.`);
  }
  const body = {
    body: requireFlag(flags, "body"),
    from: optionalFlag(flags, "from", "agent_codex"),
    taskId: optionalFlag(flags, "task", "task_general"),
    to: requireFlag(flags, "to")
      .split(",")
      .map((agentId) => agentId.trim())
      .filter(Boolean),
    type
  };

  try {
    await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/messages/broadcast`, body);
    deps.stdout.write(`Broadcast ${body.type} to ${body.to.join(", ")}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    const inboxPaths = body.to.map((to) => appendLocalInboxFallback(deps, runId, { ...body, to }, cause));
    deps.stdout.write(`Broadcast ${body.type} to ${body.to.join(", ")} via local inbox fallback: ${inboxPaths.join(", ")}\n`);
  }
  return 0;
}

async function submitHandoff(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const handoff = buildStructuredHandoff(argv, flags, deps);

  try {
    await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/handoffs`, handoff);
    deps.stdout.write(`Submitted handoff ${handoff.handoffId} to ${handoff.recipient}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    appendLocalStructuredHandoff(deps, runId, handoff);
    deps.stdout.write(`Submitted handoff ${handoff.handoffId} to ${handoff.recipient} via local ledger fallback\n`);
  }

  return 0;
}

async function acknowledgeHandoff(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const handoffId = requireFlag(flags, "handoff");
  const ackBy = requireFlag(flags, "from");
  const status = normalizeHandoffAckStatus(requireFlag(flags, "status"));
  const taskId = flags.get("task")?.trim();
  const note = flags.get("note")?.trim();
  const body = {
    ackBy,
    handoffId,
    note,
    status,
    taskId
  };

  try {
    await postJson(
      deps.fetcher,
      `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/handoffs/${encodeURIComponent(handoffId)}/ack`,
      body
    );
    deps.stdout.write(`Acknowledged handoff ${handoffId} as ${status}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    appendLocalHandoffAck(deps, runId, body);
    deps.stdout.write(`Acknowledged handoff ${handoffId} as ${status} via local ledger fallback\n`);
  }

  return 0;
}

async function listHandoffs(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const events = parseAcceptanceEvents(await readAcceptanceEvents(source, deps));
  const pendingOnly = flags.get("pending") === "true";
  const pending = pendingStructuredHandoffs(events);
  const rows = pendingOnly
    ? pending
    : events
        .filter((event) => event.type === "handoff.submitted")
        .map((event) => ({
          from: payloadString(event, "from") || event.actor,
          handoffId: payloadString(event, "handoffId"),
          recipient: payloadString(event, "recipient") || payloadString(event, "to"),
          summary: payloadString(event, "summary"),
          taskId: eventTaskId(event)
        }));

  if (rows.length === 0) {
    deps.stdout.write(pendingOnly ? "No pending handoffs.\n" : "No handoffs.\n");
    return 0;
  }

  for (const row of rows) {
    deps.stdout.write(`${row.handoffId} ${row.from} -> ${row.recipient} ${row.taskId}: ${row.summary}\n`);
  }

  return 0;
}

async function completeTask(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const workspaceRoot = workspaceRootFromDeps(deps);
  const taskId = requireFlag(flags, "task");
  const agentId = requireFlag(flags, "from");
  const handoffPath = requireFlag(flags, "handoff");
  const evidencePath = requireFlag(flags, "evidence");

  for (const path of [handoffPath, evidencePath]) {
    if (!existsSync(resolve(deps.cwd(), path))) {
      throw new Error(`Task complete artifact does not exist: ${path}`);
    }
  }

  const handoffFlags = parseFlags(argv);
  handoffFlags.set("file", handoffPath);
  const handoff = buildStructuredHandoff(["--file", handoffPath, ...argv], handoffFlags, deps);
  const handoffEvent = appendLocalStructuredHandoff(deps, runId, handoff);
  const commandsRun = multiFlagValues(argv, "command");
  const files = [evidencePath, ...multiFlagValues(argv, "file").filter((path) => path !== handoffPath)];
  const risks = multiFlagValues(argv, "risk");
  const touchedFiles = multiFlagValues(argv, "touched");
  const workspaceProof = flags.get("workspace-proof")?.trim();

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: agentId,
    createdAt: new Date().toISOString(),
    payload: {
      commandsRun,
      evidenceFiles: [evidencePath],
      files,
      handoffId: handoff.handoffId,
      remainingRisks: risks,
      sources: multiFlagValues(argv, "source"),
      status: "passed",
      summary: requireFlag(flags, "summary"),
      taskId,
      taskType: flags.get("task-type")?.trim() || "general",
      title: requireFlag(flags, "summary"),
      touchedFiles,
      workspaceProof
    },
    runId,
    taskId,
    type: "evidence.submitted"
  });

  const eventsAfterEvidence = loadEventRecords(eventsPathForRun(workspaceRoot, runId));
  const gateReport = evaluateEvidenceGate({
    agentId,
    events: eventsAfterEvidence,
    taskId,
    taskType: parseTaskType(flags.get("task-type")?.trim() || "general")
  });

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      agentId,
      checks: gateReport.checks,
      evidenceSeq: gateReport.evidenceSeq,
      handoffId: handoffEvent.payload?.handoffId,
      status: gateReport.status,
      taskType: gateReport.taskType
    },
    runId,
    taskId,
    type: "evidence.gate.checked"
  });

  const failedChecks = gateReport.checks.filter((item) => !item.passed);
  const closureStatus = gateReport.reviewable ? "done" : "blocked";
  const closureProgress = gateReport.reviewable ? 100 : 95;

  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: agentId,
    createdAt: new Date().toISOString(),
    payload: {
      failedChecks: failedChecks.map((item) => item.id),
      gateStatus: gateReport.status,
      progress: closureProgress,
      status: closureStatus
    },
    runId,
    taskId,
    type: "task.status_changed"
  });
  appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: agentId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId,
      failedChecks: failedChecks.map((item) => item.id),
      gateStatus: gateReport.status,
      status: closureStatus
    },
    runId,
    taskId,
    type: "crew.member.status_changed"
  });

  if (gateReport.reviewable) {
    appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
      actor: agentId,
      createdAt: new Date().toISOString(),
      payload: {
        evidencePath,
        gateStatus: gateReport.status,
        handoffId: handoff.handoffId,
        handoffPath,
        summary: requireFlag(flags, "summary"),
        taskId
      },
      runId,
      taskId,
      type: "task.completed"
    });
  }

  const failedSuffix =
    failedChecks.length > 0 ? `; failed checks: ${failedChecks.map((item) => item.id).join(", ")}` : "";
  deps.stdout.write(
    `${gateReport.reviewable ? "Completed" : "Blocked"} ${taskId} for ${agentId}; evidence gate ${gateReport.status}${failedSuffix}\n`
  );
  return gateReport.reviewable ? 0 : 0;
}

async function submitEvidence(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const evidenceFiles = multiFlagValues(argv, "file");
  const body: Record<string, string | string[]> = {
    from: requireFlag(flags, "from"),
    status: optionalFlag(flags, "status", "passed"),
    summary: requireFlag(flags, "summary"),
    taskId: requireFlag(flags, "task")
  };
  const structuredFields = [
    ["commandsRun", multiFlagValues(argv, "command")],
    ["files", evidenceFiles],
    ["remainingRisks", multiFlagValues(argv, "risk")],
    ["screenshots", multiFlagValues(argv, "screenshot")],
    ["sources", multiFlagValues(argv, "source")],
    ["touchedFiles", multiFlagValues(argv, "touched")]
  ] as const;

  for (const [key, value] of structuredFields) {
    if (value.length > 0) {
      body[key] = value;
    }
  }

  const taskType = flags.get("task-type")?.trim();
  if (taskType) {
    body.taskType = taskType;
  }

  const workspaceProof = flags.get("workspace-proof")?.trim();
  if (workspaceProof) {
    body.workspaceProof = workspaceProof;
  }

  try {
    await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/evidence`, body);
    deps.stdout.write(`Submitted evidence for ${body.taskId}\n`);
  } catch (cause) {
    if (!isApiReachabilityError(cause)) {
      throw cause;
    }

    appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
      actor: String(body.from),
      createdAt: new Date().toISOString(),
      payload: {
        ...body,
        deliveryMode: "local_ledger",
        deliveryStatus: "not_injected",
        error: cause instanceof Error ? cause.message : String(cause)
      },
      runId,
      taskId: String(body.taskId),
      type: "evidence.submitted"
    });
    deps.stdout.write(`Submitted evidence for ${body.taskId} via local ledger fallback\n`);
  }

  const extractedClaims = extractClaimsFromEvidenceFiles(evidenceFiles, deps);
  for (const [index, extracted] of extractedClaims.entries()) {
    appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
      actor: String(body.from),
      createdAt: new Date().toISOString(),
      payload: {
        claim: extracted.claim,
        claimId: `claim_${String(body.taskId)}_${claimSlug(extracted.claim) || index + 1}`,
        confidence: "medium",
        extraction: "evidence_file",
        sourceArtifact: extracted.sourcePath,
        sources: extracted.sources,
        status: "unverified",
        taskId: String(body.taskId)
      },
      runId,
      taskId: String(body.taskId),
      type: "claim.submitted"
    });
  }
  return 0;
}

async function sendAdvisorNote(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const kind = optionalFlag(flags, "kind", "advice");

  if (!ADVISOR_KINDS.has(kind)) {
    throw new Error("Advisor kind must be advice, research, or risk.");
  }

  const body: Record<string, string> = {
    body: requireFlag(flags, "body"),
    kind
  };
  const source = flags.get("source")?.trim();
  if (source) {
    body.source = source;
  }

  await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/advisor`, body);
  deps.stdout.write(`Sent advisor ${kind} to agent_codex\n`);
  return 0;
}

async function readAdvisorInbox(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const limit = Math.max(1, Number.parseInt(optionalFlag(flags, "limit", "10"), 10) || 10);
  const run = await getJson<{
    mailbox?: Array<{
      body?: unknown;
      createdAt?: unknown;
      from?: unknown;
      to?: unknown;
      type?: unknown;
    }>;
  }>(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}`);
  const notes = (run.mailbox ?? []).filter((message) => message.from === "advisor" && message.to === "agent_codex");

  if (notes.length === 0) {
    deps.stdout.write("No advisor messages for agent_codex.\n");
    return 0;
  }

  for (const note of notes.slice(-limit)) {
    const type = typeof note.type === "string" ? note.type : "advice";
    const createdAt = typeof note.createdAt === "string" ? note.createdAt : "";
    const body = typeof note.body === "string" ? note.body : "";
    deps.stdout.write(`[${type}] ${createdAt} ${body}\n`);
  }

  return 0;
}

async function readContextBundle(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const agentId = flags.get("agent")?.trim();
  const taskId = flags.get("task")?.trim();
  const format = optionalFlag(flags, "format", "markdown");

  if (!agentId) {
    throw new Error("Missing required --agent.");
  }

  if (format !== "markdown" && format !== "json") {
    throw new Error("Context bundle --format must be markdown or json.");
  }

  const params = new URLSearchParams();
  params.set("agentId", agentId);
  if (taskId) {
    params.set("taskId", taskId);
  }

  const bundle = await getJson<ContextBundle>(
    deps.fetcher,
    `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/context-bundle?${params.toString()}`
  );

  deps.stdout.write(format === "json" ? `${JSON.stringify(bundle, null, 2)}\n` : `${formatContextBundleMarkdown(bundle)}\n`);
  return 0;
}

function demoRunFromEvents(events: DemoEvent[], runId: string): DemoRun {
  const rowers: DemoRun["crew"]["rowers"] = events
    .filter((event) => event.type === "crew.member.registered" && (payloadString(event, "agentId") || event.actor) !== "agent_codex")
    .map((event) => ({
      id: payloadString(event, "agentId") || event.actor,
      name: payloadString(event, "name") || payloadString(event, "agentId") || event.actor,
      platform: payloadString(event, "platform") === "codex_cli" ? "codex_cli" : "claude_code_cli",
      role: payloadString(event, "role") || "worker",
      status: payloadString(event, "status") === "running" ? "running" : "ready"
    }));

  return {
    agentLogs: [],
    crew: {
      rowers,
      steerer: {
        id: "agent_codex",
        name: "Codex Steerer",
        platform: "codex_cli",
        role: "steerer",
        status: "steering"
      }
    },
    events,
    evidence: [],
    language: "zh",
    mailbox: [],
    phase: "running",
    runId,
    tasks: []
  };
}

async function printSharedFactBoard(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  const board = createSharedFactBoard({
    events,
    runId: runIdFromEvents(events, source.runId)
  });
  writeJsonOrMarkdown(flags, deps, board, formatSharedFactBoardMarkdown(board));
  return 0;
}

async function readContextDelta(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const agentId = flags.get("to")?.trim() || flags.get("agent")?.trim();
  if (!agentId) {
    throw new Error("Context delta requires --to <agentId>.");
  }
  const sinceSeq = Number.parseInt(requireFlag(flags, "since"), 10);
  if (!Number.isFinite(sinceSeq) || sinceSeq < 0) {
    throw new Error("Context delta --since must be a non-negative sequence number.");
  }

  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  const runId = runIdFromEvents(events, source.runId);
  const delta = createContextDelta(demoRunFromEvents(events, runId), {
    agentId,
    sinceSeq,
    taskId: flags.get("task")?.trim() || undefined
  });
  writeJsonOrMarkdown(flags, deps, delta, formatContextDeltaMarkdown(delta));
  return 0;
}

function kebabScoreField(field: DelegationScoreField) {
  return field.replace(/_/g, "-");
}

function scoreFlags(flags: Map<string, string>): DelegationScores {
  const scores: Partial<DelegationScores> = {};

  for (const field of DELEGATION_SCORE_FIELDS) {
    const value = flags.get(kebabScoreField(field));
    if (value === undefined) {
      throw new Error(`Missing required --${kebabScoreField(field)}.`);
    }
    scores[field] = Number.parseInt(value, 10);
  }

  return scores as DelegationScores;
}

function writeTextOutput(path: string | undefined, cwd: string, content: string) {
  if (!path) {
    return;
  }

  const outputPath = resolve(cwd, path);
  mkdirSync(dirname(outputPath), {
    recursive: true
  });
  writeFileSync(outputPath, content);
}

function runIdFromEvents(events: DemoEvent[], fallback?: string) {
  return fallback ?? events[0]?.runId ?? "run_unknown";
}

const INACTIVE_AGENT_STATUSES = new Set(["blocked", "done", "ready", "stopped"]);
const LOCAL_RUN_ARTIFACT_DIRS = ["logs", "task-packets", "uploads", "inbox", "handoffs", "evidence"];

function eventPayloadText(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function refreshLocalRunState(eventsPath: string, events: DemoEvent[], updatedAt: string) {
  const runDir = dirname(eventsPath);
  const statePath = join(runDir, "state.json");
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const runId = runIdFromEvents(events, previous.runId);
  const statuses = new Map<string, string>();

  for (const event of events) {
    const agentId = eventPayloadText(event, "agentId") || event.actor;
    const status = eventPayloadText(event, "status");

    if (event.type === "crew.member.registered" && agentId) {
      statuses.set(agentId, status || (agentId === "agent_codex" ? "steering" : "ready"));
    }

    if (event.type === "crew.member.status_changed" && agentId && status) {
      statuses.set(agentId, status);
    }

    if (event.type === "command.started" && agentId && agentId !== "agent_codex") {
      statuses.set(agentId, "running");
    }

    if (event.type === "command.finished" && agentId && agentId !== "agent_codex") {
      const exitCode = event.payload?.exitCode;
      statuses.set(agentId, typeof exitCode === "number" && exitCode === 0 ? "done" : "blocked");
    }
  }

  const activeAgentCount = Math.max(
    1,
    [...statuses.values()].filter((status) => !INACTIVE_AGENT_STATUSES.has(status)).length
  );
  const hasReview = events.some((event) => event.type === "steerer.review.completed" || event.type === "workflow.acceptance.completed");
  const nextState = {
    ...previous,
    activeAgentCount,
    eventRecordPath: eventsPath,
    phase: hasReview ? "reviewed" : activeAgentCount > 1 ? "running" : previous.phase ?? "ready",
    runId,
    updatedAt
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

function seedLocalRunState(input: { createdAt: string; runId: string; title: string; workspaceRoot: string }) {
  const runDir = join(localRunsDir(input.workspaceRoot), input.runId);
  const statePath = join(runDir, "state.json");
  const eventRecordPath = eventsPathForRun(input.workspaceRoot, input.runId);
  ensureLocalRunArtifactDirs(runDir);

  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const nextState = {
    ...previous,
    activeAgentCount: previous.activeAgentCount ?? 1,
    createdAt: previous.createdAt ?? input.createdAt,
    eventRecordPath,
    phase: previous.phase ?? "running",
    runId: input.runId,
    title: previous.title ?? input.title,
    updatedAt: input.createdAt,
    workspaceRoot: input.workspaceRoot
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

function ensureLocalRunArtifactDirs(runDir: string) {
  ensureDir(runDir);
  for (const name of LOCAL_RUN_ARTIFACT_DIRS) {
    ensureDir(join(runDir, name));
  }
}

function appendLocalEvent(eventsPath: string, event: Omit<DemoEvent, "id" | "seq">) {
  ensureLocalRunArtifactDirs(dirname(eventsPath));
  const events = loadEventRecords(eventsPath);
  const nextSeq = events.reduce((maxSeq, item) => Math.max(maxSeq, item.seq), 0) + 1;
  const nextEvent: DemoEvent = {
    ...event,
    id: `evt_${String(nextSeq).padStart(4, "0")}`,
    seq: nextSeq
  };
  const nextEvents = [...events, nextEvent];
  writeEventRecordEnvelope(eventsPath, nextEvent.runId, nextEvents, nextEvent.createdAt);
  refreshLocalRunState(eventsPath, nextEvents, nextEvent.createdAt);
  return nextEvent;
}

interface LocalMailboxFallbackInput {
  body: string;
  from: string;
  taskId: string;
  to: string;
  type: string;
}

function safeInboxFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 80) || "message";
}

function writeLocalInboxMessage(workspaceRoot: string, runId: string, event: DemoEvent, message: LocalMailboxFallbackInput) {
  const inboxDir = join(localRunsDir(workspaceRoot), runId, "inbox", message.to);
  ensureDir(inboxDir);
  const inboxPath = join(inboxDir, `${event.id}-${safeInboxFileSegment(message.type)}.md`);
  const content = [
    "# DragonBoat Local Inbox Message",
    "",
    `- Run ID: \`${runId}\``,
    `- Event ID: \`${event.id}\``,
    `- From: \`${message.from}\``,
    `- To: \`${message.to}\``,
    `- Task: \`${message.taskId}\``,
    `- Type: \`${message.type}\``,
    `- Created At: \`${event.createdAt}\``,
    "",
    "## Body",
    "",
    message.body,
    ""
  ].join("\n");
  writeFileSync(inboxPath, content);
  return inboxPath;
}

function appendLocalInboxFallback(
  deps: Required<DragonBoatCliDependencies>,
  runId: string,
  message: LocalMailboxFallbackInput,
  cause: unknown
) {
  const workspaceRoot = workspaceRootFromDeps(deps);
  const inboxDir = join(localRunsDir(workspaceRoot), runId, "inbox", message.to);
  const event = appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: message.from,
    createdAt: new Date().toISOString(),
    payload: {
      body: message.body,
      deliveryMode: "local_inbox",
      deliveryStatus: "queued_inbox",
      error: cause instanceof Error ? cause.message : String(cause),
      from: message.from,
      inboxDir,
      messageType: message.type,
      taskId: message.taskId,
      to: message.to,
      type: message.type
    },
    runId,
    taskId: message.taskId,
    type: "mailbox.message.sent"
  });

  return writeLocalInboxMessage(workspaceRoot, runId, event, message);
}

function appendLocalMailboxDelivery(
  deps: Required<DragonBoatCliDependencies>,
  runId: string,
  message: LocalMailboxFallbackInput,
  payload: Record<string, unknown> = {}
) {
  const workspaceRoot = workspaceRootFromDeps(deps);
  const inboxDir = join(localRunsDir(workspaceRoot), runId, "inbox", message.to);
  const event = appendLocalEvent(eventsPathForRun(workspaceRoot, runId), {
    actor: message.from,
    createdAt: new Date().toISOString(),
    payload: {
      ...payload,
      body: message.body,
      deliveryMode: "local_inbox",
      deliveryStatus: "queued_inbox",
      from: message.from,
      inboxDir,
      messageType: message.type,
      taskId: message.taskId,
      to: message.to,
      type: message.type
    },
    runId,
    taskId: message.taskId,
    type: "mailbox.message.sent"
  });

  return writeLocalInboxMessage(workspaceRoot, runId, event, message);
}

function structuredHandoffBody(input: StructuredHandoffInput) {
  return [
    "# DragonBoat Structured Handoff",
    "",
    `- Handoff ID: \`${input.handoffId ?? createHandoffId(input)}\``,
    `- From: \`${input.from}\``,
    `- To: \`${input.recipient}\``,
    `- Task: \`${input.taskId}\``,
    `- Confidence: \`${input.confidence}\``,
    `- Ack Required: \`${input.ackRequired ? "yes" : "no"}\``,
    input.artifactPath ? `- Artifact: \`${input.artifactPath}\`` : "",
    "",
    "## Summary",
    "",
    input.summary,
    "",
    "## Claims",
    "",
    ...input.claims.map((claim) => `- ${claim}`),
    "",
    "## Sources",
    "",
    ...input.sources.map((source) => `- ${source}`),
    "",
    "## Open Questions",
    "",
    ...input.openQuestions.map((question) => `- ${question}`),
    "",
    "## Required Action",
    "",
    input.requiredAction,
    input.body ? ["", "## Body", "", input.body].join("\n") : "",
    ""
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function requireMultiFlag(argv: string[], name: string) {
  const values = multiFlagValues(argv, name);
  if (values.length === 0) {
    throw new Error(`Missing required --${name}.`);
  }
  return values;
}

function buildStructuredHandoff(argv: string[], flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>) {
  const from = requireFlag(flags, "from");
  const recipient = requireFlag(flags, "to");
  const taskId = requireFlag(flags, "task");
  const artifactPath = flags.get("file")?.trim();
  const handoff: StructuredHandoffInput = {
    ackRequired: flags.get("no-ack") !== "true" && flags.get("ack-required") !== "false",
    ...(artifactPath ? { artifactPath } : {}),
    body: flags.get("body")?.trim() || undefined,
    claims: requireMultiFlag(argv, "claim"),
    confidence: normalizeHandoffConfidence(requireFlag(flags, "confidence")),
    from,
    handoffId: flags.get("handoff-id")?.trim() || createHandoffId({ from, recipient, taskId }),
    openQuestions: requireMultiFlag(argv, "open-question"),
    recipient,
    requiredAction: requireFlag(flags, "required-action"),
    sources: requireMultiFlag(argv, "source"),
    summary: requireFlag(flags, "summary"),
    taskId
  };

  if (artifactPath && existsSync(resolve(deps.cwd(), artifactPath))) {
    handoff.body = deps.readFile(resolve(deps.cwd(), artifactPath));
  }

  return handoff;
}

function appendLocalStructuredHandoff(
  deps: Required<DragonBoatCliDependencies>,
  runId: string,
  handoff: StructuredHandoffInput,
  options: { materializeInbox?: boolean } = {}
) {
  const workspaceRoot = workspaceRootFromDeps(deps);
  const eventsPath = eventsPathForRun(workspaceRoot, runId);
  const handoffId = handoff.handoffId ?? createHandoffId(handoff);
  const event = appendLocalEvent(eventsPath, {
    actor: handoff.from,
    createdAt: new Date().toISOString(),
    payload: {
      ackRequired: handoff.ackRequired,
      ack_required: handoff.ackRequired,
      artifactPath: handoff.artifactPath,
      artifact_path: handoff.artifactPath,
      body: handoff.body,
      claims: handoff.claims,
      confidence: handoff.confidence,
      from: handoff.from,
      handoffId,
      openQuestions: handoff.openQuestions,
      open_questions: handoff.openQuestions,
      recipient: handoff.recipient,
      requiredAction: handoff.requiredAction,
      required_action: handoff.requiredAction,
      sources: handoff.sources,
      summary: handoff.summary,
      taskId: handoff.taskId,
      to: handoff.recipient
    },
    runId,
    taskId: handoff.taskId,
    type: "handoff.submitted"
  });

  if (options.materializeInbox !== false) {
    appendLocalMailboxDelivery(
      deps,
      runId,
      {
        body: structuredHandoffBody({ ...handoff, handoffId }),
        from: handoff.from,
        taskId: handoff.taskId,
        to: handoff.recipient,
        type: "contract"
      },
      {
        handoffId,
        structured: true
      }
    );
  }

  return event;
}

function appendLocalHandoffAck(
  deps: Required<DragonBoatCliDependencies>,
  runId: string,
  input: { ackBy: string; handoffId: string; note?: string; status: string; taskId?: string }
) {
  return appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
    actor: input.ackBy,
    createdAt: new Date().toISOString(),
    payload: {
      ackBy: input.ackBy,
      handoffId: input.handoffId,
      note: input.note,
      status: normalizeHandoffAckStatus(input.status),
      taskId: input.taskId
    },
    runId,
    taskId: input.taskId,
    type: "handoff.acknowledged"
  });
}

function optionalEventsPathForActiveRun(deps: Required<DragonBoatCliDependencies>) {
  const runId = deps.env.DRAGONBOAT_RUN_ID?.trim();
  if (!runId) {
    return null;
  }
  const workspaceRoot = workspaceRootFromDeps(deps);

  return {
    eventsPath: eventsPathForRun(workspaceRoot, runId),
    runId
  };
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function eventTaskId(event: DemoEvent) {
  const record = event as DemoEvent & { taskId?: string };
  return record.taskId ?? payloadString(event, "taskId");
}

function eventAgentId(event: DemoEvent) {
  return payloadString(event, "agentId") || event.actor;
}

function latestAgenticMode(events: DemoEvent[]) {
  return events
    .filter((event) => event.type === "agentic.mode.selected")
    .map((event) => payloadString(event, "mode"))
    .filter(Boolean)
    .at(-1);
}

function requireAgenticModeBeforeRowerStart(workspaceRoot: string, runId: string) {
  const events = loadEventRecords(eventsPathForRun(workspaceRoot, runId));
  const requirementEnabled = events.some((event) => event.type === "agentic.mode.required");
  if (!requirementEnabled) {
    return;
  }

  const mode = latestAgenticMode(events);
  if (mode === "agent_team" || mode === "dynamic_workflow") {
    return;
  }

  throw new Error(
    [
      "agentic mode assessment is required before starting rowers in a DragonBoat steered session.",
      "Run `dragonboat workflow assess` or `dragonboat delegate assess` and only start rowers when the selected mode is agent_team or dynamic_workflow."
    ].join(" ")
  );
}

function activeWorkflowAgents(events: DemoEvent[], workflowId: string) {
  const active = new Set<string>();

  for (const event of events) {
    const eventWorkflow = payloadString(event, "workflowId") || payloadString(event, "workflow_id");
    if (eventWorkflow && eventWorkflow !== workflowId) {
      continue;
    }

    if (event.type === "workflow.agent.spawned") {
      const agentId = eventAgentId(event);
      if (agentId) {
        active.add(agentId);
      }
    }

    if (event.type === "workflow.agent.stopped") {
      const agentId = eventAgentId(event);
      active.delete(agentId);
    }
  }

  return [...active];
}

function latestWorkflowControl(events: DemoEvent[], workflowId: string) {
  return events
    .filter((event) => event.type === "workflow.control.requested" && payloadString(event, "workflowId") === workflowId)
    .at(-1);
}

function phaseAgentId(workflowId: string, phase: WorkflowPhase, index: number, attempt = 0) {
  const retrySuffix = attempt > 0 ? `_r${attempt + 1}` : "";
  const slug = `${workflowId}_${phase.kind}_${index + 1}${retrySuffix}`
    .toLowerCase()
    .replace(/^workflow_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 54);
  return `agent_${slug || `workflow_${index + 1}`}`;
}

function taskIdForPhase(phase: WorkflowPhase) {
  return `task_${phase.kind}`;
}

function workflowRowerPrompt(plan: WorkflowPlan, phase: WorkflowPhase, agentId: string) {
  const browserRoutes = phase.routes.filter((route) =>
    ["browser_research", "dynamic_page_research", "social_platform_research", "visual_research"].includes(route)
  );
  const browserSection =
    browserRoutes.length > 0
      ? [
          "",
          "## Browser Research Capability",
          `- Required capability routes: ${browserRoutes.map((route) => `\`${route}\``).join(", ")}`,
          "- Run `.dragonboat/bin/dragonboat browser doctor --workspace <workspace>` before relying on browser/CDP observations.",
          "- Use browser-backed observation for dynamic pages, screenshots, and visual evidence instead of blind terminal fetching.",
          "- Evidence must include source URL or artifact path, screenshot path when visual, browser/CDP command used, and remaining risks.",
          "- If browser/CDP/web-access is unhealthy, submit a blocker instead of silently downgrading to text-only research."
        ]
      : [];
  return [
    `# Workflow Phase Packet: ${agentId}`,
    "",
    "## Shared Workflow Goal",
    plan.goal,
    "",
    "## Phase",
    `- Workflow ID: \`${plan.workflow_id}\``,
    `- Phase ID: \`${phase.id}\``,
    `- Phase kind: \`${phase.kind}\``,
    `- Stop condition: ${phase.stop_condition}`,
    "",
    "## Inputs",
    ...phase.inputs.map((input) => `- ${input}`),
    "",
    "## Expected Outputs",
    ...phase.outputs.map((output) => `- ${output}`),
    "",
    "## Quality Pattern",
    ...phase.quality_patterns.map((pattern) => `- ${pattern}`),
    "",
    "## Claim Ledger Requirement",
    "Before claiming done, submit sourced claims with `.dragonboat/bin/dragonboat claim submit`.",
    "A different verifier/refuter must review critical claims with `.dragonboat/bin/dragonboat claim review` before synthesis.",
    "Refuted claims must not be included in final synthesis. Unresolved conflicts must be listed explicitly.",
    "",
    "## Evidence Gate Requirement",
    `Submit evidence for \`${taskIdForPhase(phase)}\` with \`--task-type workflow_claim\` and include commands, files, risks, workspace proof, and sources.`,
    ...browserSection,
    "",
    "Use Chinese for natural-language progress and final summaries."
  ].join("\n");
}

function claimSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function extractClaimsFromMarkdown(text: string, sourcePath: string) {
  const lines = text.split(/\r?\n/g);
  const claims: Array<{ claim: string; sources: string[] }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^\s*(?:[-*]\s*)?(?:#{1,6}\s*)?claim\s*[:：]\s*(.+)$/i);
    if (!match?.[1]?.trim()) {
      continue;
    }

    const sources: string[] = [];
    const nextLine = lines[index + 1] ?? "";
    const sourceMatch = nextLine.match(/^\s*(?:[-*]\s*)?source\s*[:：]\s*(.+)$/i);
    if (sourceMatch?.[1]?.trim()) {
      sources.push(sourceMatch[1].trim());
    }
    sources.push(sourcePath);
    claims.push({
      claim: match[1].trim(),
      sources: [...new Set(sources)]
    });
  }

  return claims;
}

function extractClaimsFromEvidenceFiles(filePaths: string[], deps: Required<DragonBoatCliDependencies>) {
  const claims: Array<{ claim: string; sourcePath: string; sources: string[] }> = [];

  for (const filePath of filePaths) {
    const absolutePath = resolve(deps.cwd(), filePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    for (const extracted of extractClaimsFromMarkdown(deps.readFile(absolutePath), filePath)) {
      claims.push({
        ...extracted,
        sourcePath: filePath
      });
    }
  }

  return claims;
}

async function assessDelegation(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const format = optionalFlag(flags, "format", "markdown");
  if (format !== "markdown" && format !== "json") {
    throw new Error("Delegation assessment --format must be markdown or json.");
  }

  const assessment = assessDelegationFit(scoreFlags(flags), multiFlagValues(argv, "hard-blocker"));
  const content = format === "json" ? `${JSON.stringify(assessment, null, 2)}\n` : formatDelegationAssessmentMarkdown(assessment);
  writeTextOutput(flags.get("out"), deps.cwd(), content);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: assessment as unknown as Record<string, unknown>,
      runId: activeRun.runId,
      type: "delegation.fit.assessed"
    });
  }

  deps.stdout.write(content);
  return 0;
}

function readDelegationFit(value: string, deps: Required<DragonBoatCliDependencies>): DelegationFitAssessment {
  const source = value.trim().startsWith("{") ? value : deps.readFile(resolve(deps.cwd(), value));
  return parseDelegationFitAssessment(JSON.parse(source));
}

async function createDelegationPacket(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const outPath = requireFlag(flags, "out");
  const taskId = requireFlag(flags, "task");
  const agentId = requireFlag(flags, "agent");
  const fit = readDelegationFit(requireFlag(flags, "fit"), deps);
  const runId = deps.env.DRAGONBOAT_RUN_ID?.trim() || "run_unknown";
  const capabilities = multiFlagValues(argv, "capability");
  const needsBrowserResearch = capabilities.some((capability) =>
    ["browser", "browser_research", "dynamic_page_research", "social_platform_research", "visual_research", "web-access"].some((token) =>
      capability.toLowerCase().includes(token)
    )
  );
  const packet = createSealedTaskPacket({
    acceptance: multiFlagValues(argv, "acceptance"),
    agentId,
    allowedPaths: multiFlagValues(argv, "allowed-path"),
    browserResearch: needsBrowserResearch
      ? {
          allowedDomains: multiFlagValues(argv, "browser-domain"),
          browser: flags.get("browser")?.trim(),
          screenshotRequirements: multiFlagValues(argv, "screenshot-requirement"),
          sourceUrls: multiFlagValues(argv, "source")
        }
      : undefined,
    fit,
    inputs: multiFlagValues(argv, "input"),
    mission: requireFlag(flags, "mission"),
    missionContract:
      flags.has("shared-mission") || flags.has("stance") || flags.has("synthesis-owner") || multiFlagValues(argv, "peer").length > 0
        ? {
            nonGoals: multiFlagValues(argv, "non-goal"),
            requiredPeerInteractions: multiFlagValues(argv, "peer"),
            roleStance: flags.get("stance")?.trim(),
            sharedMission: flags.get("shared-mission")?.trim(),
            synthesisOwner: flags.get("synthesis-owner")?.trim()
          }
        : undefined,
    role: requireFlag(flags, "role"),
    runId,
    taskId,
    workspaceRoot: deps.cwd()
  });

  writeTextOutput(outPath, deps.cwd(), packet);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        agentId,
        outPath,
        taskId
      },
      runId: activeRun.runId,
      taskId,
      type: "sealed.task_packet.created"
    });
  }

  deps.stdout.write(`Wrote sealed task packet ${outPath}\n`);
  return 0;
}

function booleanWorkflowFlag(flags: Map<string, string>, name: string) {
  const value = flags.get(name);
  if (value === undefined) {
    return undefined;
  }

  return value === "true" || value === "1" || value === "yes";
}

function workflowTaskSignals(flags: Map<string, string>): AgenticTaskSignals {
  return {
    crossCheckRequired: booleanWorkflowFlag(flags, "cross-check"),
    estimatedTokens: numberFlag(flags, "estimated-tokens"),
    expectedAgentCount: numberFlag(flags, "expected-agents"),
    hiddenComplexity: booleanWorkflowFlag(flags, "hidden-complexity"),
    maxConcurrency: numberFlag(flags, "max-concurrency"),
    phaseCount: numberFlag(flags, "phase-count"),
    requiresHumanApproval: booleanWorkflowFlag(flags, "requires-human-approval")
  };
}

async function assessWorkflow(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const format = optionalFlag(flags, "format", "markdown");
  if (format !== "markdown" && format !== "json") {
    throw new Error("Workflow assessment --format must be markdown or json.");
  }

  const assessment = assessAgenticMode({
    hardBlockers: multiFlagValues(argv, "hard-blocker"),
    scores: scoreFlags(flags),
    taskSignals: workflowTaskSignals(flags)
  });
  const content = format === "json" ? `${JSON.stringify(assessment, null, 2)}\n` : formatAgenticModeAssessmentMarkdown(assessment);
  writeTextOutput(flags.get("out"), deps.cwd(), content);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: assessment as unknown as Record<string, unknown>,
      runId: activeRun.runId,
      type: "agentic.mode.assessed"
    });
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        mode: assessment.mode,
        reasons: assessment.reasons
      },
      runId: activeRun.runId,
      type: "agentic.mode.selected"
    });
  }

  deps.stdout.write(content);
  return 0;
}

function parsePhaseKinds(value: string | undefined): WorkflowPhaseKind[] | undefined {
  const values = splitFlagList(value);
  if (values.length === 0) {
    return undefined;
  }

  const allowed = new Set(["cross_check", "discover", "fanout", "shard", "synthesize", "verify"]);
  for (const value of values) {
    if (!allowed.has(value)) {
      throw new Error("Workflow --phase must be one of discover, shard, fanout, cross_check, synthesize, verify.");
    }
  }

  return values as WorkflowPhaseKind[];
}

async function draftWorkflow(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const goal = requireFlag(flags, "goal");
  const plan = createWorkflowPlan({
    costCapUsd: numberFlag(flags, "cost-cap-usd"),
    goal,
    humanApprovalRequired: Boolean(booleanWorkflowFlag(flags, "human-approval")),
    maxConcurrency: numberFlag(flags, "max-concurrency"),
    maxTotalAgents: numberFlag(flags, "max-total-agents"),
    phaseKinds: parsePhaseKinds(flags.get("phase")),
    tokenCap: numberFlag(flags, "token-cap"),
    workflowId: flags.get("workflow")?.trim(),
    workspaceRoot: resolve(optionalFlag(flags, "workspace", deps.cwd()))
  });
  const outputPath = resolve(deps.cwd(), flags.get("out")?.trim() || join(".dragonboat", "workflows", `${plan.workflow_id}.json`));
  mkdirSync(dirname(outputPath), {
    recursive: true
  });
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        goal: plan.goal,
        limits: plan.limits,
        outputPath,
        phaseCount: plan.phases.length,
        workflowId: plan.workflow_id
      },
      runId: activeRun.runId,
      type: "workflow.plan.created"
    });
  }

  deps.stdout.write(`Wrote workflow plan ${outputPath}\n`);
  deps.stdout.write(formatWorkflowPlanMarkdown(plan));
  return 0;
}

function readWorkflowPlanFromFlags(flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>): WorkflowPlan {
  const planPath = requireFlag(flags, "plan");
  return JSON.parse(deps.readFile(resolve(deps.cwd(), planPath))) as WorkflowPlan;
}

async function validateWorkflow(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const plan = readWorkflowPlanFromFlags(flags, deps);
  const report = validateWorkflowPlan(plan);

  if (!report.valid) {
    throw new Error(report.errors.join("\n"));
  }

  deps.stdout.write(`workflow plan valid: ${plan.workflow_id}\n`);
  return 0;
}

async function handleWorkflowPack(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const [action = "list", ...rest] = argv;
  const flags = parseFlags(rest);

  if (action === "list") {
    deps.stdout.write(`${JSON.stringify(listWorkflowPacks(), null, 2)}\n`);
    return 0;
  }

  const packId = requireFlag(flags, "pack");
  const pack = getWorkflowPack(packId);
  if (!pack) {
    throw new Error(`Unknown workflow pack: ${packId}`);
  }

  if (action === "show") {
    deps.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
    return 0;
  }

  if (action === "install") {
    const outputPath = resolve(deps.cwd(), flags.get("out")?.trim() || join(".dragonboat", "workflow-packs", `${pack.id}.json`));
    mkdirSync(dirname(outputPath), {
      recursive: true
    });
    writeFileSync(outputPath, `${JSON.stringify(pack, null, 2)}\n`);
    const activeRun = optionalEventsPathForActiveRun(deps);
    if (activeRun) {
      appendLocalEvent(activeRun.eventsPath, {
        actor: "agent_codex",
        createdAt: new Date().toISOString(),
        payload: {
          outputPath,
          packId: pack.id
        },
        runId: activeRun.runId,
        type: "workflow.pack.installed"
      });
    }
    deps.stdout.write(`Installed workflow pack ${pack.id} at ${outputPath}\n`);
    return 0;
  }

  if (action === "draft") {
    const plan = renderWorkflowPackPlan(pack.id, {
      goal: requireFlag(flags, "goal"),
      workspaceRoot: resolve(optionalFlag(flags, "workspace", deps.cwd()))
    });
    const outputPath = resolve(deps.cwd(), flags.get("out")?.trim() || join(".dragonboat", "workflows", `${plan.workflow_id}.json`));
    mkdirSync(dirname(outputPath), {
      recursive: true
    });
    writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
    const activeRun = optionalEventsPathForActiveRun(deps);
    if (activeRun) {
      appendLocalEvent(activeRun.eventsPath, {
        actor: "agent_codex",
        createdAt: new Date().toISOString(),
        payload: {
          goal: plan.goal,
          outputPath,
          packId: pack.id,
          phaseCount: plan.phases.length,
          workflowId: plan.workflow_id
        },
        runId: activeRun.runId,
        type: "workflow.plan.created"
      });
    }
    deps.stdout.write(`Drafted workflow ${plan.workflow_id} from pack ${pack.id} at ${outputPath}\n`);
    deps.stdout.write(formatWorkflowPlanMarkdown(plan));
    return 0;
  }

  throw new Error("Workflow pack action must be list, show, install, or draft.");
}

async function stopWorkflowAgents(input: {
  agentIds: string[];
  deps: Required<DragonBoatCliDependencies>;
  eventsFile: string;
  reason: string;
  runId: string;
  workflowId: string;
}) {
  for (const agentId of input.agentIds) {
    await postJson(
      input.deps.fetcher,
      `${apiUrl(input.deps.env)}/api/sessions/${encodeURIComponent(input.runId)}/rowers/${encodeURIComponent(agentId)}`,
      {},
      "DELETE"
    ).catch(() => undefined);
    appendLocalEvent(input.eventsFile, {
      actor: "workflow_supervisor",
      createdAt: new Date().toISOString(),
      payload: {
        agentId,
        reason: input.reason,
        workflowId: input.workflowId
      },
      runId: input.runId,
      type: "workflow.agent.stopped"
    });
  }
}

function workflowAgentStatus(events: DemoEvent[], agentId: string) {
  const statusEvent = events
    .filter((event) => event.type === "crew.member.status_changed" && eventAgentId(event) === agentId)
    .at(-1);
  const status = payloadString(statusEvent ?? ({} as DemoEvent), "status");
  if (status === "done" || status === "stopped" || status === "blocked") {
    return status;
  }

  const commandFinished = events
    .filter((event) => event.type === "command.finished" && eventAgentId(event) === agentId)
    .at(-1);
  if (commandFinished) {
    const exitCode = commandFinished.payload?.exitCode;
    return exitCode === 0 ? "done" : "blocked";
  }

  return "running";
}

function appendEvidenceGateForAgent(input: {
  agentId: string;
  events: DemoEvent[];
  eventsFile: string;
  runId: string;
  taskId: string;
}) {
  const report = evaluateEvidenceGate({
    agentId: input.agentId,
    events: input.events,
    taskId: input.taskId,
    taskType: "workflow_claim"
  });

  appendLocalEvent(input.eventsFile, {
    actor: "workflow_supervisor",
    createdAt: new Date().toISOString(),
    payload: {
      agentId: input.agentId,
      checks: report.checks,
      evidenceSeq: report.evidenceSeq,
      status: report.status,
      taskType: report.taskType
    },
    runId: input.runId,
    taskId: input.taskId,
    type: "evidence.gate.checked"
  });

  return report;
}

async function waitForWorkflowPhase(input: {
  agentIds: string[];
  deps: Required<DragonBoatCliDependencies>;
  eventsFile: string;
  intervalSeconds: number;
  phase: WorkflowPhase;
  phaseTimeoutSeconds: number;
  plan: WorkflowPlan;
  runId: string;
}) {
  const deadline = Date.now() + input.phaseTimeoutSeconds * 1000;
  const taskId = taskIdForPhase(input.phase);

  while (true) {
    const events = loadEventRecords(input.eventsFile);
    const control = latestWorkflowControl(events, input.plan.workflow_id);
    const action = payloadString(control ?? ({} as DemoEvent), "action");

    if (action === "stop") {
      await stopWorkflowAgents({
        agentIds: input.agentIds,
        deps: input.deps,
        eventsFile: input.eventsFile,
        reason: "workflow stop requested",
        runId: input.runId,
        workflowId: input.plan.workflow_id
      });
      return {
        reason: "workflow stop requested",
        status: "blocked" as const
      };
    }

    if (action === "pause") {
      if (Date.now() >= deadline) {
        return {
          reason: "workflow paused past phase timeout",
          status: "blocked" as const
        };
      }
      await sleep(input.intervalSeconds * 1000);
      continue;
    }

    const statuses = input.agentIds.map((agentId) => workflowAgentStatus(events, agentId));
    if (statuses.includes("blocked")) {
      await stopWorkflowAgents({
        agentIds: input.agentIds,
        deps: input.deps,
        eventsFile: input.eventsFile,
        reason: "phase agent blocked",
        runId: input.runId,
        workflowId: input.plan.workflow_id
      });
      return {
        reason: "phase agent blocked",
        status: "blocked" as const
      };
    }

    if (statuses.every((status) => status === "done" || status === "stopped")) {
      const freshEvents = loadEventRecords(input.eventsFile);
      const reports = input.agentIds.map((agentId) =>
        appendEvidenceGateForAgent({
          agentId,
          events: freshEvents,
          eventsFile: input.eventsFile,
          runId: input.runId,
          taskId
        })
      );

      if (reports.some((report) => !report.reviewable)) {
        return {
          reason: "workflow claim evidence gate rejected a phase agent",
          status: "blocked" as const
        };
      }

      return {
        reason: "phase agents completed and evidence gates passed",
        status: "completed" as const
      };
    }

    if (Date.now() >= deadline) {
      await stopWorkflowAgents({
        agentIds: input.agentIds,
        deps: input.deps,
        eventsFile: input.eventsFile,
        reason: "phase timeout",
        runId: input.runId,
        workflowId: input.plan.workflow_id
      });
      return {
        reason: "phase timeout",
        status: "blocked" as const
      };
    }

    await sleep(input.intervalSeconds * 1000);
  }
}

async function runWorkflow(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const plan = parseWorkflowPlan(readWorkflowPlanFromFlags(flags, deps));
  const sourceRunId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || `run_${plan.workflow_id}`;
  const eventsFile = eventsPathForRun(workspaceRootFromDeps(deps), sourceRunId);
  const phaseTimeoutSeconds = Math.max(0, Number.parseInt(optionalFlag(flags, "phase-timeout-seconds", "900"), 10) || 0);
  const intervalSeconds = Math.max(0, Number.parseInt(optionalFlag(flags, "interval-seconds", "5"), 10) || 0);
  const phaseRetries = Math.max(0, Number.parseInt(optionalFlag(flags, "phase-retries", "0"), 10) || 0);

  appendLocalEvent(eventsFile, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      goal: plan.goal,
      limits: plan.limits,
      phaseCount: plan.phases.length,
      workflowId: plan.workflow_id
    },
    runId: sourceRunId,
    type: "workflow.plan.created"
  });
  appendLocalEvent(eventsFile, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      mode: "dynamic_workflow",
      reasons: ["workflow run selected dynamic_workflow mode"]
    },
    runId: sourceRunId,
    type: "agentic.mode.selected"
  });

  for (const phase of plan.phases) {
    const attemptCount = flags.has("dry-run") ? 1 : phaseRetries + 1;
    let phaseCompleted = false;

    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      appendLocalEvent(eventsFile, {
        actor: "workflow_supervisor",
        createdAt: new Date().toISOString(),
        payload: {
          phaseId: phase.id,
          phaseKind: phase.kind,
          retryAttempt: attempt,
          workflowId: plan.workflow_id
        },
        runId: sourceRunId,
        type: "workflow.phase.started"
      });

      if (flags.has("dry-run")) {
        phaseCompleted = true;
        break;
      }

      const agentIds: string[] = [];
      for (let index = 0; index < phase.max_agents; index += 1) {
        const agentId = phaseAgentId(plan.workflow_id, phase, index, attempt);
        agentIds.push(agentId);
        await postJson(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(sourceRunId)}/rowers`, {
          agentId,
          prompt: workflowRowerPrompt(plan, phase, agentId),
          role: phase.kind,
          route: {
            reason: "DragonBoat workflow phase route",
            requiredCapabilities: phase.routes,
            role: phase.kind
          }
        });
        appendLocalEvent(eventsFile, {
          actor: "workflow_supervisor",
          createdAt: new Date().toISOString(),
          payload: {
            agentId,
            phaseId: phase.id,
            phaseKind: phase.kind,
            retryAttempt: attempt,
            taskId: taskIdForPhase(phase),
            workflowId: plan.workflow_id
          },
          runId: sourceRunId,
          taskId: taskIdForPhase(phase),
          type: "workflow.agent.spawned"
        });
      }

      const result = await waitForWorkflowPhase({
        agentIds,
        deps,
        eventsFile,
        intervalSeconds,
        phase,
        phaseTimeoutSeconds,
        plan,
        runId: sourceRunId
      });

      if (result.status === "blocked") {
        appendLocalEvent(eventsFile, {
          actor: "workflow_supervisor",
          createdAt: new Date().toISOString(),
          payload: {
            canRetry: attempt < phaseRetries,
            phaseId: phase.id,
            phaseKind: phase.kind,
            reason: result.reason,
            retryAttempt: attempt,
            workflowId: plan.workflow_id
          },
          runId: sourceRunId,
          type: "workflow.supervision.blocked"
        });
        if (attempt < phaseRetries) {
          deps.stdout.write(`workflow retrying ${phase.id} after attempt ${attempt + 1}: ${result.reason}\n`);
          continue;
        }
        deps.stdout.write(`workflow blocked at ${phase.id}: ${result.reason}\n`);
        return 1;
      }

      for (const agentId of agentIds) {
        appendLocalEvent(eventsFile, {
          actor: "workflow_supervisor",
          createdAt: new Date().toISOString(),
          payload: {
            agentId,
            phaseId: phase.id,
            reason: "phase completed",
            retryAttempt: attempt,
            workflowId: plan.workflow_id
          },
          runId: sourceRunId,
          taskId: taskIdForPhase(phase),
          type: "workflow.agent.stopped"
        });
      }

      phaseCompleted = true;
      break;
    }

    if (!phaseCompleted) {
      deps.stdout.write(`workflow blocked at ${phase.id}: phase did not complete\n`);
      return 1;
    }

    appendLocalEvent(eventsFile, {
      actor: "workflow_supervisor",
      createdAt: new Date().toISOString(),
      payload: {
        phaseId: phase.id,
        phaseKind: phase.kind,
        workflowId: plan.workflow_id
      },
      runId: sourceRunId,
      type: "workflow.phase.completed"
    });
  }

  if (!flags.has("dry-run")) {
    appendLocalEvent(eventsFile, {
      actor: "workflow_supervisor",
      createdAt: new Date().toISOString(),
      payload: {
        phaseCount: plan.phases.length,
        status: "accepted",
        truthModel: "submitted_reviewable_accepted",
        workflowId: plan.workflow_id
      },
      runId: sourceRunId,
      type: "workflow.acceptance.completed"
    });
    appendLocalEvent(eventsFile, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        reason: "all workflow phases completed with reviewable evidence gates",
        status: "accepted",
        truthModel: "submitted_reviewable_accepted",
        workflowId: plan.workflow_id
      },
      runId: sourceRunId,
      type: "steerer.review.completed"
    });
  }

  deps.stdout.write(
    flags.has("dry-run")
      ? `workflow dry-run recorded for ${plan.workflow_id} in ${eventsFile}\n`
      : `workflow run completed for ${plan.workflow_id} in ${eventsFile}\n`
  );
  return 0;
}

async function controlWorkflow(action: "pause" | "resume" | "stop", argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workflowId = requireFlag(flags, "workflow");
  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || `run_${workflowId}`;
  const eventsFile = eventsPathForRun(workspaceRootFromDeps(deps), runId);
  const controlEvent = appendLocalEvent(eventsFile, {
    actor: "workflow_supervisor",
    createdAt: new Date().toISOString(),
    payload: {
      action,
      phaseId: flags.get("phase")?.trim() || "",
      reason: flags.get("reason")?.trim() || "manual workflow control",
      workflowId
    },
    runId,
    type: "workflow.control.requested"
  });

  if (action === "stop") {
    const events = loadEventRecords(eventsFile);
    const agents = activeWorkflowAgents(events, workflowId);
    await stopWorkflowAgents({
      agentIds: agents,
      deps,
      eventsFile,
      reason: payloadString(controlEvent, "reason"),
      runId,
      workflowId
    });
  }

  deps.stdout.write(`workflow ${action} recorded for ${workflowId}\n`);
  return 0;
}

function localRunsDir(workspaceRoot: string) {
  return join(workspaceRoot, ".dragonboat", "runs");
}

function eventsPathForRun(workspaceRoot: string, runId: string) {
  return join(localRunsDir(workspaceRoot), runId, "events.ndjson");
}

function workspaceRootFromDeps(deps: Required<DragonBoatCliDependencies>) {
  return resolve(deps.env.DRAGONBOAT_WORKSPACE_ROOT?.trim() || deps.cwd());
}

function readWorkspaceRelativeFile(deps: Required<DragonBoatCliDependencies>, workspaceRoot: string, path: string) {
  const cwdPath = resolve(deps.cwd(), path);
  if (existsSync(cwdPath)) {
    return deps.readFile(cwdPath);
  }

  return deps.readFile(resolve(workspaceRoot, path));
}

function makeWatchdogContinuationEvent(
  runId: string,
  events: DemoEvent[],
  decision: WatchdogDecisionResult,
  hookInput: CodexStopHookInput,
  continuationCount: number
): DemoEvent {
  const nextSeq = events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq), 0) + 1;

  return {
    actor: "watchdog",
    createdAt: new Date().toISOString(),
    id: `evt_${String(nextSeq).padStart(4, "0")}`,
    payload: {
      continuationCount,
      pendingFromSeq: decision.pendingFromSeq,
      pendingKinds: decision.pendingKinds,
      pendingToSeq: decision.pendingToSeq,
      reason: decision.reason,
      stopHookActive: Boolean(hookInput.stop_hook_active),
      trigger: "stop_hook",
      turnId: hookInput.turn_id ?? ""
    },
    runId,
    seq: nextSeq,
    type: "watchdog.continuation.recorded"
  };
}

async function readHookInput(flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>) {
  const directInput = flags.get("hook-input");
  if (directInput !== undefined && directInput !== "-") {
    return directInput;
  }

  try {
    return await deps.stdin();
  } catch {
    return "";
  }
}

function parseHookInput(raw: string): CodexStopHookInput {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as CodexStopHookInput;
  } catch {
    return {};
  }
}

async function watchdogStopCheck(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const rawHookInput = await readHookInput(flags, deps);
  const hookInput = parseHookInput(rawHookInput);
  const workspaceRoot = resolve(flags.get("workspace")?.trim() || deps.env.DRAGONBOAT_WORKSPACE_ROOT || hookInput.cwd || deps.cwd());
  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim() || latestRunId(workspaceRoot);
  const eventsFile = eventsPathForRun(workspaceRoot, runId);
  const events = loadEventRecords(eventsFile);

  if (events.length === 0) {
    return 0;
  }

  const stateFile = watchdogStatePath(workspaceRoot, runId);
  const state = loadWatchdogState(stateFile);
  const decision = decideWatchdogAction(hookInput, events, state, runId);
  const nextState = advanceStateAfterDecision(state, decision, hookInput);

  saveWatchdogState(stateFile, nextState);

  if (!decision.shouldContinue) {
    return 0;
  }

  const continuationEvent = makeWatchdogContinuationEvent(
    runId,
    events,
    decision,
    hookInput,
    nextState.consecutiveContinuationCount
  );
  writeEventRecordEnvelope(eventsFile, runId, [...events, continuationEvent], continuationEvent.createdAt);
  deps.stdout.write(`${JSON.stringify({ decision: "block", reason: decision.reason })}\n`);
  return 0;
}

function latestRunId(workspaceRoot: string) {
  const runsDir = localRunsDir(workspaceRoot);

  if (!existsSync(runsDir)) {
    throw new Error(`No DragonBoat run directory found at ${runsDir}.`);
  }

  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const statePath = join(runsDir, entry.name, "state.json");
      let createdAt = entry.name;

      if (existsSync(statePath)) {
        try {
          const state = JSON.parse(readFileSync(statePath, "utf8")) as { createdAt?: unknown };
          if (typeof state.createdAt === "string") {
            createdAt = state.createdAt;
          }
        } catch {
          // Fall back to directory name when a run state is partially written.
        }
      }

      return {
        createdAt,
        runId: entry.name
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.runId.localeCompare(a.runId));

  const latest = runs.at(0)?.runId;
  if (!latest) {
    throw new Error(`No DragonBoat runs found at ${runsDir}.`);
  }

  return latest;
}

interface AcceptanceRunSource {
  eventsPath: string;
  runId?: string;
}

function acceptanceRunSource(flags: Map<string, string>, deps: Required<DragonBoatCliDependencies>): AcceptanceRunSource {
  const explicitEvents = flags.get("events")?.trim();
  if (explicitEvents) {
    return {
      eventsPath: resolve(deps.cwd(), explicitEvents)
    };
  }

  if (flags.has("latest")) {
    const latest = latestRunId(workspaceRootFromDeps(deps));
    return {
      eventsPath: eventsPathForRun(workspaceRootFromDeps(deps), latest),
      runId: latest
    };
  }

  const runId = flags.get("run")?.trim() || deps.env.DRAGONBOAT_RUN_ID?.trim();
  if (runId) {
    return {
      eventsPath: eventsPathForRun(workspaceRootFromDeps(deps), runId),
      runId
    };
  }

  throw new Error(
    "Missing acceptance run source. Provide --events <events.ndjson>, --run <runId>, --latest, or run inside `dragonboat steer` with DRAGONBOAT_RUN_ID."
  );
}

async function readAcceptanceEvents(source: AcceptanceRunSource, deps: Required<DragonBoatCliDependencies>) {
  try {
    return deps.readFile(source.eventsPath);
  } catch (cause) {
    if (!source.runId) {
      throw cause;
    }

    const run = await getJson<{ events?: unknown[] }>(deps.fetcher, `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(source.runId)}`);

    if (!Array.isArray(run.events)) {
      throw cause;
    }

    return JSON.stringify({
      events: run.events
    });
  }
}

async function validateFirstCrewLoop(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const report = validateFirstCrewLoopAcceptance(parseAcceptanceEvents(raw));

  deps.stdout.write(formatAcceptanceReport(report));
  return report.passed ? 0 : 1;
}

function smokeCheck(id: string, label: string, passed: boolean, detail: string): AcceptanceCheck {
  return {
    detail,
    id,
    label,
    passed
  };
}

async function validateSmokeAcceptance(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  const rowerRegistration = events.find(
    (event) =>
      event.type === "crew.member.registered" &&
      payloadString(event, "agentId") !== "agent_codex" &&
      payloadString(event, "platform") === "claude_code_cli"
  );
  const rowerId = rowerRegistration ? payloadString(rowerRegistration, "agentId") : "";
  const steererRegistered = events.some(
    (event) =>
      event.type === "crew.member.registered" &&
      payloadString(event, "agentId") === "agent_codex" &&
      payloadString(event, "platform") === "codex_cli"
  );
  const rowerCommandStarted = events.some(
    (event) =>
      event.type === "command.started" &&
      payloadString(event, "agentId") === rowerId &&
      payloadString(event, "command").includes("claude")
  );
  const intentConfirmed = events.some(
    (event) =>
      event.type === "mailbox.message.sent" &&
      (event.actor === rowerId || payloadString(event, "from") === rowerId) &&
      (payloadString(event, "to") === "agent_codex" || payloadString(event, "target") === "agent_codex") &&
      (payloadString(event, "type") === "intent_confirmed" || payloadString(event, "messageType") === "intent_confirmed") &&
      payloadString(event, "body").trim().length > 0
  );
  const evidenceSubmitted = events.some(
    (event) =>
      event.type === "evidence.submitted" &&
      (event.actor === rowerId || payloadString(event, "from") === rowerId) &&
      payloadString(event, "summary").trim().length > 0
  );
  const rowerStopped = events.some(
    (event) =>
      event.type === "crew.member.status_changed" &&
      payloadString(event, "agentId") === rowerId &&
      payloadString(event, "status") === "stopped"
  );
  const checks = [
    smokeCheck("steerer_registered", "Codex steerer registered", steererRegistered, steererRegistered ? "agent_codex registered as codex_cli" : "Missing agent_codex codex_cli registration."),
    smokeCheck("rower_registered", "one Claude rower registered", Boolean(rowerId), rowerId ? `${rowerId} registered as claude_code_cli` : "Missing Claude rower registration."),
    smokeCheck("rower_command_started", "rower CLI command started", rowerCommandStarted, rowerCommandStarted ? `${rowerId} has command.started` : "Missing rower command.started event."),
    smokeCheck(
      "rower_intent_confirmed",
      "rower intent_confirmed mailbox",
      intentConfirmed,
      intentConfirmed ? `${rowerId} sent intent_confirmed to agent_codex` : "Missing rower intent_confirmed mailbox to agent_codex."
    ),
    smokeCheck("rower_evidence_submitted", "rower evidence submitted", evidenceSubmitted, evidenceSubmitted ? `${rowerId} submitted evidence` : "Missing rower evidence."),
    smokeCheck("rower_stopped", "rower stopped", rowerStopped, rowerStopped ? `${rowerId} stopped` : "Missing rower stopped lifecycle event.")
  ];
  const report: AcceptanceReport = {
    checks,
    passed: checks.every((check) => check.passed),
    title: "smoke"
  };

  deps.stdout.write(formatAcceptanceReport(report));
  return report.passed ? 0 : 1;
}

async function runLocalSmoke(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const workspaceRoot = resolve(optionalFlag(flags, "workspace", deps.cwd()));
  const createdAt = new Date().toISOString();
  const runId =
    flags.get("run")?.trim() ||
    deps.env.DRAGONBOAT_RUN_ID?.trim() ||
    `run_release_smoke_${createdAt.replace(/[-:.]/g, "_").replace(/_000Z$/, "Z")}`;
  const rowerId = optionalFlag(flags, "agent", "agent_release_smoke");
  const taskId = optionalFlag(flags, "task", "task_release_smoke");
  const title = optionalFlag(flags, "title", "DragonBoat release smoke");
  const eventsFile = eventsPathForRun(workspaceRoot, runId);

  installBootstrapKit(workspaceRoot);
  seedLocalRunState({
    createdAt,
    runId,
    title,
    workspaceRoot
  });

  appendLocalEvent(eventsFile, {
    actor: "agent_codex",
    createdAt,
    payload: {
      projectName: basename(workspaceRoot) || "DragonBoat workspace",
      smokeKind: "local_projection",
      title,
      workspaceRoot
    },
    runId,
    type: "run.created"
  });

  appendLocalEvent(eventsFile, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      agentId: "agent_codex",
      name: "Codex Steerer",
      platform: "codex_cli",
      role: "steerer",
      status: "steering"
    },
    runId,
    type: "crew.member.registered"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      displayNameZh: "发布烟测划手",
      name: "Release Smoke Rower",
      platform: "claude_code_cli",
      role: "release_smoke",
      status: "running"
    },
    runId,
    taskId,
    type: "crew.member.registered"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      args: ["--print", "--output-format", "stream-json", "<smoke-prompt>"],
      command: "claude",
      note: "local projection smoke; does not spend model tokens"
    },
    runId,
    taskId,
    type: "command.started"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      from: rowerId,
      messageType: "intent_confirmed",
      taskId,
      to: "agent_codex",
      type: "intent_confirmed",
      body: "intent_confirmed: release smoke rower received the task and confirms the minimal DragonBoat loop."
    },
    runId,
    taskId,
    type: "mailbox.message.sent"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      line: "Release smoke rower completed the local projection loop."
    },
    runId,
    taskId,
    type: "command.output"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      commandsRun: ["dragonboat smoke run"],
      files: [eventsFile],
      remainingRisks: ["This smoke validates ledger/deck projection only; run `dragonboat doctor --deep` for provider route health."],
      status: "passed",
      summary: "Release smoke generated steerer, rower, intent, evidence, and stopped lifecycle events.",
      taskType: "general",
      title: "DragonBoat release smoke"
    },
    runId,
    taskId,
    type: "evidence.submitted"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      exitCode: 0,
      signal: null
    },
    runId,
    taskId,
    type: "command.finished"
  });

  appendLocalEvent(eventsFile, {
    actor: rowerId,
    createdAt: new Date().toISOString(),
    payload: {
      agentId: rowerId,
      status: "stopped"
    },
    runId,
    taskId,
    type: "crew.member.status_changed"
  });

  if (flags.has("open") && !flags.has("no-open")) {
    await deps.openUrl(webUrl(deps.env));
  }

  deps.stdout.write(
    [
      "DragonBoat release smoke run created",
      `workspace: ${workspaceRoot}`,
      `run: ${runId}`,
      `events: ${eventsFile}`,
      "",
      `Validate: dragonboat acceptance smoke --events ${eventsFile}`,
      `Deck: ${webUrl(deps.env)}`
    ].join("\n")
  );
  deps.stdout.write("\n");
  return 0;
}

async function validateReplayLaunch(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const videoPath = flags.get("video")?.trim();
  const report = validateReplayLaunchAcceptance(parseAcceptanceEvents(raw), {
    fileExists: existsSync,
    videoPath: videoPath ? resolve(deps.cwd(), videoPath) : undefined
  });

  deps.stdout.write(formatAcceptanceReport(report));
  return report.passed ? 0 : 1;
}

function parseTaskType(value: string): EvidenceTaskType {
  if (
    value === "backend_contract" ||
    value === "browser_research" ||
    value === "general" ||
    value === "research" ||
    value === "runtime" ||
    value === "ui" ||
    value === "workflow_claim"
  ) {
    return value;
  }

  throw new Error("Evidence gate --task-type must be general, ui, runtime, backend_contract, research, browser_research, or workflow_claim.");
}

async function runEvidenceGate(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  const taskId = requireFlag(flags, "task");
  const agentId = requireFlag(flags, "agent");
  const report = evaluateEvidenceGate({
    agentId,
    events,
    taskId,
    taskType: parseTaskType(optionalFlag(flags, "task-type", "general"))
  });
  const runId = runIdFromEvents(events, source.runId);
  const eventsPath = source.eventsPath;

  appendLocalEvent(eventsPath, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      agentId,
      checks: report.checks,
      evidenceSeq: report.evidenceSeq,
      status: report.status,
      taskType: report.taskType
    },
    runId,
    taskId,
    type: "evidence.gate.checked"
  });

  deps.stdout.write(formatEvidenceGateReport(report));
  return report.reviewable ? 0 : 1;
}

function parseClaimReviewStatus(value: string) {
  if (value === "conflicted" || value === "needs_human" || value === "refuted" || value === "supported") {
    return value;
  }

  throw new Error("Claim review --status must be supported, refuted, conflicted, or needs_human.");
}

async function submitClaim(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const agentId = optionalFlag(flags, "from", optionalFlag(flags, "agent", "agent_codex"));
  const taskId = requireFlag(flags, "task");
  const claimId = requireFlag(flags, "claim-id");
  const sources = multiFlagValues(argv, "source");

  appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
    actor: agentId,
    createdAt: new Date().toISOString(),
    payload: {
      claim: requireFlag(flags, "claim"),
      claimId,
      confidence: optionalFlag(flags, "confidence", "medium"),
      sources,
      status: "unverified",
      taskId
    },
    runId,
    taskId,
    type: "claim.submitted"
  });
  deps.stdout.write(`Submitted claim ${claimId} for ${taskId}\n`);
  return 0;
}

async function reviewClaim(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const verifierAgent = optionalFlag(flags, "from", optionalFlag(flags, "agent", "agent_codex"));
  const taskId = requireFlag(flags, "task");
  const claimId = requireFlag(flags, "claim-id");
  const status = parseClaimReviewStatus(requireFlag(flags, "status"));

  appendLocalEvent(eventsPathForRun(workspaceRootFromDeps(deps), runId), {
    actor: verifierAgent,
    createdAt: new Date().toISOString(),
    payload: {
      claimId,
      finalSynthesisIncluded: Boolean(booleanWorkflowFlag(flags, "final-synthesis-included")),
      note: flags.get("note")?.trim() || "",
      sources: multiFlagValues(argv, "source"),
      status,
      taskId,
      verifierAgent
    },
    runId,
    taskId,
    type: "claim.reviewed"
  });
  deps.stdout.write(`Reviewed claim ${claimId} as ${status}\n`);
  return 0;
}

function parseSupervisionExpectations(value: string): SupervisionExpectation[] {
  const expectations = splitFlagList(value);
  const allowed = new Set(["evidence", "intent_confirmed", "status"]);

  if (expectations.length === 0) {
    throw new Error("Supervision --expect must include intent_confirmed, status, evidence, or a comma-separated combination.");
  }

  for (const expectation of expectations) {
    if (!allowed.has(expectation)) {
      throw new Error("Supervision --expect values must be intent_confirmed, status, or evidence.");
    }
  }

  return expectations as SupervisionExpectation[];
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function supervisionEventType(status: string): DemoEvent["type"] {
  if (status === "complete") {
    return "supervision.wait.completed";
  }

  if (status === "blocked") {
    return "supervision.wait.blocked";
  }

  return "supervision.wait.timeout";
}

async function superviseWait(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const agents = splitFlagList(requireFlag(flags, "agents"));
  if (agents.length === 0) {
    throw new Error("Supervision --agents must include at least one agent id.");
  }

  const expectations = parseSupervisionExpectations(optionalFlag(flags, "expect", "intent_confirmed,status,evidence"));
  const timeoutSeconds = Math.max(0, Number.parseInt(optionalFlag(flags, "timeout", "900"), 10) || 0);
  const intervalSeconds = Math.max(1, Number.parseInt(optionalFlag(flags, "interval", "5"), 10) || 5);
  const deadline = Date.now() + timeoutSeconds * 1000;
  const source = acceptanceRunSource(flags, deps);
  let latestEvents: DemoEvent[] = [];
  let report = evaluateCrewSupervision({
    agents,
    events: latestEvents,
    expectations
  });

  while (true) {
    const raw = await readAcceptanceEvents(source, deps);
    latestEvents = parseAcceptanceEvents(raw);
    report = evaluateCrewSupervision({
      agents,
      events: latestEvents,
      expectations
    });

    if (report.status === "complete" || report.status === "blocked" || Date.now() >= deadline) {
      const runId = runIdFromEvents(latestEvents, source.runId);
      appendLocalEvent(source.eventsPath, {
        actor: "agent_codex",
        createdAt: new Date().toISOString(),
        payload: {
          agents,
          expectations,
          report
        },
        runId,
        type: supervisionEventType(report.status)
      });
      deps.stdout.write(formatCrewSupervisionReport(report));
      return report.status === "complete" ? 0 : 1;
    }

    await sleep(intervalSeconds * 1000);
  }
}

function numberFlag(flags: Map<string, string>, name: string) {
  const value = flags.get(name)?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function markdownArtifactDirsForEventsPath(eventsPath: string) {
  const runDir = dirname(eventsPath);
  const dragonboatDir = dirname(dirname(runDir));
  return [join(dragonboatDir, "evidence"), join(dragonboatDir, "handoffs"), join(runDir, "evidence"), join(runDir, "handoffs")];
}

interface MarkdownArtifactText {
  path: string;
  text: string;
}

function collectMarkdownArtifactTexts(dir: string, deps: Required<DragonBoatCliDependencies>, depth = 0): MarkdownArtifactText[] {
  if (!existsSync(dir) || depth > 3) {
    return [];
  }

  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return collectMarkdownArtifactTexts(path, deps, depth + 1);
    }
    if (!stat.isFile() || !entry.endsWith(".md")) {
      return [];
    }
    return [
      {
        path,
        text: deps.readFile(path)
      }
    ];
  });
}

function benchmarkArtifactTexts(source: AcceptanceRunSource, deps: Required<DragonBoatCliDependencies>) {
  const dirs = [
    ...markdownArtifactDirsForEventsPath(source.eventsPath),
    join(deps.cwd(), ".dragonboat", "evidence"),
    join(deps.cwd(), ".dragonboat", "handoffs")
  ];
  const seen = new Set<string>();
  const artifactsByName = new Map<string, string>();

  const hasTimeMetrics = (text: string) => /Estimated Solo Minutes|Single-Agent Reread Penalty Minutes/i.test(text);

  for (const dir of dirs) {
    if (seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    for (const artifact of collectMarkdownArtifactTexts(dir, deps)) {
      const name = basename(artifact.path);
      const existing = artifactsByName.get(name);
      if (existing && (hasTimeMetrics(existing) || !hasTimeMetrics(artifact.text))) {
        continue;
      }
      artifactsByName.set(name, artifact.text);
    }
  }

  return [...artifactsByName.values()];
}

async function recordBenchmark(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const source = acceptanceRunSource(flags, deps);
  const raw = await readAcceptanceEvents(source, deps);
  const events = parseAcceptanceEvents(raw);
  const benchmarkId = optionalFlag(flags, "benchmark-id", `bench_${Date.now()}`);
  const mode = optionalFlag(flags, "mode", "crew") as BenchmarkMode;

  if (mode !== "crew" && mode !== "single_agent" && mode !== "agent_team" && mode !== "dynamic_workflow") {
    throw new Error("Benchmark --mode must be single_agent, crew, agent_team, or dynamic_workflow.");
  }

  const record = createBenchmarkRecord({
    artifactTexts: benchmarkArtifactTexts(source, deps),
    benchmarkId,
    events,
    mode,
    taskClass: optionalFlag(flags, "task-class", "general"),
    taskName: requireFlag(flags, "task-name"),
    timing: {
      wall_clock_seconds: numberFlag(flags, "wall-clock-seconds")
    },
    tokenMetrics: {
      low_cost_input_tokens: numberFlag(flags, "low-cost-input-tokens"),
      low_cost_output_tokens: numberFlag(flags, "low-cost-output-tokens"),
      premium_input_tokens: numberFlag(flags, "premium-input-tokens"),
      premium_output_tokens: numberFlag(flags, "premium-output-tokens")
    },
    workspaceRoot: deps.cwd()
  });
  const outputPath = resolve(deps.cwd(), flags.get("out")?.trim() || join(".dragonboat", "benchmarks", `${benchmarkId}.json`));
  mkdirSync(dirname(outputPath), {
    recursive: true
  });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);

  appendLocalEvent(source.eventsPath, {
    actor: "agent_codex",
    createdAt: new Date().toISOString(),
    payload: {
      benchmarkId,
      mode,
      outputPath,
      taskClass: record.task_class,
      taskName: record.task_name
    },
    runId: runIdFromEvents(events, source.runId),
    type: "benchmark.recorded"
  });

  deps.stdout.write(`Recorded benchmark ${benchmarkId} at ${outputPath}\n`);
  return 0;
}

async function compareBenchmarks(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const solo = JSON.parse(deps.readFile(resolve(deps.cwd(), requireFlag(flags, "solo")))) as BenchmarkRecord;
  const crew = JSON.parse(deps.readFile(resolve(deps.cwd(), requireFlag(flags, "crew")))) as BenchmarkRecord;
  deps.stdout.write(`${JSON.stringify(compareBenchmarkRecords(solo, crew), null, 2)}\n`);
  return 0;
}

async function compareBenchmarkSuiteCli(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const records = multiFlagValues(argv, "record").map(
    (recordPath) => JSON.parse(deps.readFile(resolve(deps.cwd(), recordPath))) as BenchmarkRecord
  );

  if (records.length < 2) {
    throw new Error("Benchmark suite requires at least two --record files.");
  }

  const suite: BenchmarkSuite = createBenchmarkSuite({
    id: optionalFlag(flags, "suite-id", `suite_${Date.now()}`),
    records,
    taskName: flags.get("task-name")?.trim() || records.at(0)?.task_name || "Untitled benchmark suite"
  });
  const report = compareBenchmarkSuite(suite);
  const output = {
    report,
    suite
  };
  const outputPath = flags.get("out")?.trim()
    ? resolve(deps.cwd(), flags.get("out")?.trim() ?? "")
    : resolve(deps.cwd(), join(".dragonboat", "benchmarks", `${suite.id}.json`));
  mkdirSync(dirname(outputPath), {
    recursive: true
  });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  const activeRun = optionalEventsPathForActiveRun(deps);
  if (activeRun) {
    appendLocalEvent(activeRun.eventsPath, {
      actor: "agent_codex",
      createdAt: new Date().toISOString(),
      payload: {
        confidence: report.confidence,
        modesCompared: report.modesCompared,
        outputPath,
        recommendation: report.recommendedMode,
        suiteId: suite.id
      },
      runId: activeRun.runId,
      type: "benchmark.suite.recorded"
    });
  }

  deps.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
}

async function syncAgentConfig(argv: string[], deps: Required<DragonBoatCliDependencies>) {
  const flags = parseFlags(argv);
  const runId = runIdFromEnv(deps.env);
  const agentId = optionalFlag(flags, "agent", "agent_codex");
  const body: Record<string, string> = {};
  const model = flags.get("model")?.trim();
  const effort = flags.get("effort")?.trim();

  if (model) {
    body.model = model;
  }

  if (effort) {
    body.effort = effort;
  }

  if (!body.model && !body.effort) {
    throw new Error("Missing config value. Provide --model, --effort, or both.");
  }

  await postJson(
    deps.fetcher,
    `${apiUrl(deps.env)}/api/sessions/${encodeURIComponent(runId)}/agents/${encodeURIComponent(agentId)}/config`,
    body,
    "PATCH"
  );
  deps.stdout.write(`Synced ${agentId} route for ${runId}\n`);
  return 0;
}

function usage() {
  return [
    "Usage:",
    "  dragonboat install-command [--target <path>]",
    "  dragonboat init [--workspace <path>]",
    "  dragonboat doctor [--workspace <path>] [--deep] [--model <model>] [--effort <effort>]",
    "  dragonboat release check [--root <path>] [--format text|json]",
    "  dragonboat deck [--workspace <path>] [--api-port <port>] [--web-port <port>] [--open]",
    "  dragonboat browser doctor [--workspace <path>] [--run <runId>] [--cdp-url <url>] [--skip-external]",
    "  dragonboat browser smoke [--workspace <path>] [--run <runId>] [--url <url>] [--model kimi-k2.6] [--effort max]",
    "  dragonboat smoke run [--workspace <path>] [--run <runId>] [--agent <agentId>] [--open]",
    "  dragonboat steer [--workspace <path>] [--project <name>] [--run <runId> | --new] [--open]",
    "  dragonboat run reconcile [--workspace <path>] [--run <runId>]",
    "  dragonboat config set [--agent <agentId>] [--model <model>] [--effort <effort>]",
    "  dragonboat route recommend --role <role> [--capability <text|vision|browser_research|dynamic_page_research|visual_research|social_platform_research>] [--format task-packet|json]",
    "  dragonboat route budget --candidate <json> --subscription <json> --capability <capability> [--estimated-input-tokens <n>] [--estimated-output-tokens <n>] [--max-cost-usd <n>] [--format json|markdown]",
    "  dragonboat route set --agent <agentId> --role <role> [--model <model>] [--effort <effort>]",
    "  dragonboat capability matrix [--events <events.ndjson> | --run <runId> | --latest] [--out <path>]",
    "  dragonboat capability learn [--events <events.ndjson> | --run <runId> | --latest] [--minimum-attempts <n>] [--out <path>]",
    "  dragonboat cost trace [--events <events.ndjson> | --run <runId> | --latest] [--out <path>]",
    "  dragonboat compute plan --worker <json> --capability <capability> --privacy-class <class> [--allow-remote true|false] [--estimated-minutes <n>] [--max-cost-usd <n>] [--format json|markdown]",
    "  dragonboat privacy scan|route|redact [--provider <provider>] [--file <path>] [--content <text>] [--format json|markdown] [--out <path>]",
    "  dragonboat subscription advise --subscription <json> [--benchmark <json>] [--events <events.ndjson> | --run <runId> | --latest] [--format json|markdown]",
    "  dragonboat marketplace list|show|install [--pack <id>] [--capability <capability>] [--kind <kind>] [--out <path>]",
    "  dragonboat delegate assess --context-amortization <0-3> --parallel-split <0-3> --interface-stability <0-3> --acceptance-executability <0-3> --low-cost-rower-fit <0-3> --shared-state-penalty <0-3> --runtime-drift-penalty <0-3> [--hard-blocker <key>] [--format markdown|json] [--out <path>]",
    "  dragonboat delegate packet --agent <agentId> --role <role> --task <taskId> --mission <text> --fit <json> --input <path> --allowed-path <path> --acceptance <text> [--capability browser_research] [--browser-domain <domain>] [--source <url>] [--screenshot-requirement <text>] [--shared-mission <text>] [--synthesis-owner <agentId>] [--stance <text>] [--peer <agentId>] [--non-goal <text>] --out <path>",
    "  dragonboat workflow assess --context-amortization <0-3> --parallel-split <0-3> --interface-stability <0-3> --acceptance-executability <0-3> --low-cost-rower-fit <0-3> --shared-state-penalty <0-3> --runtime-drift-penalty <0-3> [--expected-agents <n>] [--phase-count <n>] [--cross-check] [--format markdown|json]",
    "  dragonboat workflow draft --goal <text> [--workflow <id>] [--max-concurrency <n>] [--max-total-agents <n>] [--token-cap <n>] [--cost-cap-usd <n>] [--human-approval] [--out <path>]",
    "  dragonboat workflow validate --plan <path>",
    "  dragonboat workflow pack list|show|install|draft [--pack <id>] [--goal <text>] [--out <path>]",
    "  dragonboat workflow run --plan <path> [--dry-run] [--run <runId>] [--phase-timeout-seconds <n>] [--interval-seconds <n>] [--phase-retries <n>]",
    "  dragonboat workflow pause|resume|stop --workflow <id> [--run <runId>] [--phase <phaseId>] [--reason <text>]",
    "  dragonboat supervise wait --agents <agentId,agentId> [--expect intent_confirmed,status,evidence] [--timeout <seconds>] [--events <events.ndjson> | --run <runId> | --latest]",
    "  dragonboat acceptance smoke [--events <events.ndjson> | --run <runId> | --latest]",
    "  dragonboat acceptance first-crew-loop [--events <events.ndjson> | --run <runId> | --latest]",
    "  dragonboat acceptance replay-launch [--events <events.ndjson> | --run <runId> | --latest] [--video <mp4>]",
    "  dragonboat rower start --role <role> --id <agentId> --prompt-file <file> [--new-wave]",
    "  dragonboat rower stop --id <agentId>",
    "  dragonboat rower list [--run <runId> | --latest] [--format json|text]",
    "  dragonboat rower attach --agent <agentId> --mode view|assist|takeover [--run <runId> | --latest] [--text <input>] [--end]",
    "  dragonboat rower release --agent <agentId> [--run <runId> | --latest]",
    "  dragonboat rower checkpoint create|latest|list|ensure --agent <agentId> [--run <runId> | --latest]",
    "  dragonboat message send --to <agentId> --type <type> --body <text>",
    "  dragonboat message broadcast --to <agentId,agentId> --body <text>",
    "  dragonboat handoff submit --from <agentId> --to <agentId> --task <taskId> --summary <text> --claim <text> --source <path-or-url> --confidence low|medium|high --open-question <text> --required-action <text> [--file <path>] [--no-ack]",
    "  dragonboat handoff ack --handoff <handoffId> --from <agentId> --status read|consumed|question [--note <text>]",
    "  dragonboat task complete --from <agentId> --to <agentId> --task <taskId> --handoff <file> --evidence <file> --summary <text> --claim <text> --source <path-or-url> --confidence low|medium|high --open-question <text> --required-action <text>",
    "  dragonboat evidence submit --from <agentId> --task <taskId> --summary <text> [--file <path>] [--touched <path>] [--command <cmd>] [--workspace-proof <text>] [--risk <text>] [--source <url-or-path>] [--screenshot <path>] [--task-type <type>]",
    "  dragonboat evidence gate --agent <agentId> --task <taskId> [--events <events.ndjson> | --run <runId> | --latest] [--task-type general|ui|runtime|backend_contract|research|browser_research|workflow_claim]",
    "  dragonboat claim submit --from <agentId> --task <taskId> --claim-id <id> --claim <text> [--confidence low|medium|high] [--source <url-or-path>]",
    "  dragonboat claim review --from <agentId> --task <taskId> --claim-id <id> --status supported|refuted|conflicted|needs_human [--source <url-or-path>] [--note <text>] [--final-synthesis-included]",
    "  dragonboat benchmark record [--events <events.ndjson> | --run <runId> | --latest] --mode single_agent|crew|agent_team|dynamic_workflow --task-name <name> --task-class <class> [--benchmark-id <id>]",
    "  dragonboat benchmark compare --solo <benchmark.json> --crew <benchmark.json>",
    "  dragonboat benchmark suite --record <benchmark.json> --record <benchmark.json> [--suite-id <id>] [--out <path>]",
    "  dragonboat advisor send --kind advice|research|risk --body <text> [--source <path-or-url>]",
    "  dragonboat advisor inbox [--limit <count>]",
    "  dragonboat fact board [--events <events.ndjson> | --run <runId> | --latest] [--format markdown|json]",
    "  dragonboat context bundle --agent <agentId> [--task <taskId>] [--format markdown|json]",
    "  dragonboat context delta --to <agentId> --since <seq> [--task <taskId>] [--events <events.ndjson> | --run <runId> | --latest] [--format markdown|json]",
    "  dragonboat watchdog stop-check [--workspace <path>] [--run <runId>] [--hook-input <json>]"
  ].join("\n");
}

export async function runDragonBoatCli(argv = process.argv.slice(2), dependencies: DragonBoatCliDependencies = {}) {
  const deps: Required<DragonBoatCliDependencies> = {
    checkClaudeRoute: dependencies.checkClaudeRoute ?? checkClaudeRouteHealth,
    cwd: dependencies.cwd ?? (() => process.cwd()),
    env: dependencies.env ?? process.env,
    fetcher: dependencies.fetcher ?? fetch,
    openUrl: dependencies.openUrl ?? defaultOpenUrl,
    pid: dependencies.pid ?? process.pid,
    portAvailable: dependencies.portAvailable ?? isPortAvailable,
    readFile: dependencies.readFile ?? ((path) => readFileSync(path, "utf8")),
    spawnBackground: dependencies.spawnBackground ?? defaultSpawnBackground,
    spawnForeground: dependencies.spawnForeground ?? defaultSpawnForeground,
    stdin: dependencies.stdin ?? (() => Promise.resolve(readFileSync(0, "utf8"))),
    stderr: dependencies.stderr ?? process.stderr,
    stdout: dependencies.stdout ?? process.stdout
  };

  try {
    const [command, subcommand, ...rest] = argv;

    if (!command) {
      deps.stderr.write(`${usage()}\n`);
      return 2;
    }

    if (command === "--help" || command === "-h") {
      deps.stdout.write(`${usage()}\n`);
      return 0;
    }

    if (command === "message" && subcommand === "send" && hasHelpFlag(rest)) {
      deps.stdout.write(`${messageSendUsage()}\n`);
      return 0;
    }

    if (command === "browser" && subcommand === "doctor" && hasHelpFlag(rest)) {
      deps.stdout.write(`${browserDoctorUsage()}\n`);
      return 0;
    }

    if (command === "init" && hasHelpFlag([subcommand, ...rest].filter(Boolean))) {
      deps.stdout.write(`${initUsage()}\n`);
      return 0;
    }

    if (hasHelpFlag([subcommand, ...rest].filter(Boolean))) {
      deps.stdout.write(`${usage()}\n`);
      return 0;
    }

    if (command === "init") {
      return await initWorkspace([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "install-command") {
      return await installCommand([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "doctor") {
      return await doctor([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "release" && subcommand === "check") {
      return await releaseCheck(rest, deps);
    }

    if (command === "deck") {
      return await deck([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "browser" && subcommand === "doctor") {
      return await browserDoctor(rest, deps);
    }

    if (command === "browser" && subcommand === "smoke") {
      return await browserSmoke(rest, deps);
    }

    if (command === "smoke" && subcommand === "run") {
      return await runLocalSmoke(rest, deps);
    }

    if (command === "run" && subcommand === "reconcile") {
      return await reconcileRun(rest, deps);
    }

    if (command === "steer") {
      return await steer([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "config" && subcommand === "set") {
      return await syncAgentConfig(rest, deps);
    }

    if (command === "route" && subcommand === "recommend") {
      return await recommendRowerRoute(rest, deps);
    }

    if (command === "route" && subcommand === "budget") {
      return await assessBudgetRoute(rest, deps);
    }

    if (command === "route" && subcommand === "set") {
      return await setRowerRoute(rest, deps);
    }

    if (command === "capability" && subcommand === "matrix") {
      return await printCapabilityMatrix(rest, deps);
    }

    if (command === "capability" && subcommand === "learn") {
      return await learnCapability(rest, deps);
    }

    if (command === "cost" && subcommand === "trace") {
      return await printCostTrace(rest, deps);
    }

    if (command === "compute" && subcommand === "plan") {
      return await planCompute(rest, deps);
    }

    if (command === "privacy" && subcommand === "scan") {
      return await privacyScan(rest, deps);
    }

    if (command === "privacy" && subcommand === "route") {
      return await privacyRoute(rest, deps);
    }

    if (command === "privacy" && subcommand === "redact") {
      return await privacyRedact(rest, deps);
    }

    if (command === "subscription" && subcommand === "advise") {
      return await adviseSubscriptions(rest, deps);
    }

    if (command === "marketplace") {
      return await handleMarketplace([subcommand, ...rest].filter(Boolean), deps);
    }

    if (command === "delegate" && subcommand === "assess") {
      return await assessDelegation(rest, deps);
    }

    if (command === "delegate" && subcommand === "packet") {
      return await createDelegationPacket(rest, deps);
    }

    if (command === "workflow" && subcommand === "assess") {
      return await assessWorkflow(rest, deps);
    }

    if (command === "workflow" && subcommand === "draft") {
      return await draftWorkflow(rest, deps);
    }

    if (command === "workflow" && subcommand === "validate") {
      return await validateWorkflow(rest, deps);
    }

    if (command === "workflow" && subcommand === "pack") {
      return await handleWorkflowPack(rest, deps);
    }

    if (command === "workflow" && subcommand === "run") {
      return await runWorkflow(rest, deps);
    }

    if (command === "workflow" && (subcommand === "pause" || subcommand === "resume" || subcommand === "stop")) {
      return await controlWorkflow(subcommand, rest, deps);
    }

    if (command === "supervise" && subcommand === "wait") {
      return await superviseWait(rest, deps);
    }

    if (command === "acceptance" && subcommand === "first-crew-loop") {
      return await validateFirstCrewLoop(rest, deps);
    }

    if (command === "acceptance" && subcommand === "smoke") {
      return await validateSmokeAcceptance(rest, deps);
    }

    if (command === "acceptance" && subcommand === "replay-launch") {
      return await validateReplayLaunch(rest, deps);
    }

    if (command === "rower" && subcommand === "start") {
      return await startRower(rest, deps);
    }

    if (command === "rower" && subcommand === "list") {
      return await listRowers(rest, deps);
    }

    if (command === "rower" && subcommand === "attach") {
      return await attachRower(rest, deps);
    }

    if (command === "rower" && subcommand === "release") {
      return await releaseRower(rest, deps);
    }

    if (command === "rower" && subcommand === "checkpoint") {
      return await handleRowerCheckpoint(rest[0], rest.slice(1), deps);
    }

    if (command === "rower" && subcommand === "stop") {
      return await stopRower(rest, deps);
    }

    if (command === "message" && subcommand === "send") {
      return await sendMessage(rest, deps);
    }

    if (command === "message" && subcommand === "broadcast") {
      return await broadcastMessage(rest, deps);
    }

    if (command === "handoff" && subcommand === "submit") {
      return await submitHandoff(rest, deps);
    }

    if (command === "handoff" && subcommand === "ack") {
      return await acknowledgeHandoff(rest, deps);
    }

    if (command === "handoff" && subcommand === "list") {
      return await listHandoffs(rest, deps);
    }

    if (command === "task" && subcommand === "complete") {
      return await completeTask(rest, deps);
    }

    if (command === "evidence" && subcommand === "submit") {
      return await submitEvidence(rest, deps);
    }

    if (command === "evidence" && subcommand === "gate") {
      return await runEvidenceGate(rest, deps);
    }

    if (command === "claim" && subcommand === "submit") {
      return await submitClaim(rest, deps);
    }

    if (command === "claim" && subcommand === "review") {
      return await reviewClaim(rest, deps);
    }

    if (command === "benchmark" && subcommand === "record") {
      return await recordBenchmark(rest, deps);
    }

    if (command === "benchmark" && subcommand === "compare") {
      return await compareBenchmarks(rest, deps);
    }

    if (command === "benchmark" && subcommand === "suite") {
      return await compareBenchmarkSuiteCli(rest, deps);
    }

    if (command === "advisor" && subcommand === "send") {
      return await sendAdvisorNote(rest, deps);
    }

    if (command === "advisor" && subcommand === "inbox") {
      return await readAdvisorInbox(rest, deps);
    }

    if (command === "fact" && subcommand === "board") {
      return await printSharedFactBoard(rest, deps);
    }

    if (command === "context" && subcommand === "bundle") {
      return await readContextBundle(rest, deps);
    }

    if (command === "context" && subcommand === "delta") {
      return await readContextDelta(rest, deps);
    }

    if (command === "watchdog" && subcommand === "stop-check") {
      return await watchdogStopCheck(rest, deps);
    }

    deps.stderr.write(`${usage()}\n`);
    return 2;
  } catch (cause) {
    deps.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 1;
  }
}
