import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Hono } from "hono";
import { createContextBundle } from "../shared/contextBundle";
import { projectRowerOutput } from "../shared/rowerProjection";
import {
  createHandoffId,
  normalizeHandoffAckStatus,
  normalizeHandoffConfidence
} from "../shared/structuredHandoff";
import type {
  AgentRole,
  AdvisorMessageKind,
  DemoLanguage,
  DemoRun,
  HandoffAckInput,
  HumanLoopAttachment,
  MailboxMessage,
  MessageType,
  SendAdvisorInput,
  SendHumanLoopInput,
  SendMessageInput,
  StructuredHandoffInput
} from "../shared/types";
import type { RowerRoute } from "../shared/routingPolicy";
import { AgentConfigStore, configCommands, isCrewAgentId, type AgentRuntimeConfig } from "./agentConfig";
import { createClaudeCodeWorkerRunner, type WorkerCommandRunner } from "./claudeWorkerRunner";
import { checkClaudeRouteHealth, type ClaudeRouteHealthResult } from "./claudeRouteHealth";
import { resolveClaudeCommand } from "./cliArgs";
import { CrewPtyManager } from "./crewPtyManager";
import { createDefaultClaudeWorkerTask, DemoEngine, toSseEvent, type ClaudeWorkerTask } from "./demoEngine";
import { startFullstackCliRun, type CrewPtyAdapter, type StartFullstackCliRunInput } from "./realCliCrewRunner";
import { createRemotionReplayExporter, type ReplayExporter } from "./replayExporter";
import { CrewSessionStore } from "./sessionStore";
import { TerminalHub } from "./terminalHub";

const MESSAGE_TYPES = new Set<MessageType>([
  "advice",
  "status",
  "contract",
  "question",
  "blocker",
  "research",
  "review",
  "evidence",
  "instruction",
  "intent_confirmed",
  "peer_challenge",
  "risk",
  "worklog"
]);
const ADVISOR_KINDS = new Set<AdvisorMessageKind>(["advice", "research", "risk"]);
const execFileAsync = promisify(execFile);

function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && MESSAGE_TYPES.has(value as MessageType);
}

function parseLanguage(value: unknown): DemoLanguage | { error: string } {
  if (!value || typeof value !== "object") {
    return "zh";
  }

  const language = (value as Record<string, unknown>).language;

  if (typeof language === "undefined") {
    return "zh";
  }

  if (language === "zh" || language === "en") {
    return language;
  }

  return { error: "Language must be zh or en." };
}

function parseSessionInput(value: unknown): { title?: string; workspaceRoot?: string } | { error: string } {
  if (!value || typeof value !== "object") {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const title = typeof payload.title === "string" ? payload.title.trim() : undefined;
  const workspaceRoot = typeof payload.workspaceRoot === "string" ? resolve(payload.workspaceRoot.trim()) : undefined;

  if (workspaceRoot) {
    try {
      if (!statSync(workspaceRoot).isDirectory()) {
        return { error: "Workspace root must be a directory." };
      }
    } catch {
      return { error: "Workspace root does not exist." };
    }
  }

  return {
    title,
    workspaceRoot
  };
}

function listWorkspaceDirectories(inputPath: string | null) {
  const currentPath = resolve(inputPath || homedir());
  const stat = statSync(currentPath);

  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory.");
  }

  const directories = readdirSync(currentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      path: join(currentPath, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    currentPath,
    parentPath: dirname(currentPath) === currentPath ? null : dirname(currentPath),
    directories
  };
}

function appleScriptString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function chooseNativeWorkspaceDirectory(prompt = "Choose a DragonBoat workspace folder") {
  if (process.platform !== "darwin") {
    throw new Error("Native folder picker is currently supported on macOS only.");
  }

  try {
    const script = `POSIX path of (choose folder with prompt ${appleScriptString(prompt)})`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const folderPath = resolve(stdout.trim());

    if (!statSync(folderPath).isDirectory()) {
      throw new Error("Selected workspace root must be a directory.");
    }

    return folderPath;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("User canceled") || message.includes("-128")) {
      throw new Error("Folder selection cancelled.");
    }

    throw cause;
  }
}

function parseMessageInput(value: unknown): SendMessageInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Message payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return { error: "Message body is required." };
  }

  if (
    typeof payload.from !== "string" ||
    typeof payload.to !== "string" ||
    typeof payload.taskId !== "string" ||
    !isMessageType(payload.type)
  ) {
    return { error: "Message routing fields are invalid." };
  }

  return {
    from: payload.from,
    to: payload.to,
    taskId: payload.taskId,
    type: payload.type,
    body
  };
}

function parseHumanLoopLanguage(value: FormDataEntryValue | null): DemoLanguage | { error: string } {
  if (value === null || value === "zh") {
    return "zh";
  }

  if (value === "en") {
    return "en";
  }

  return { error: "Language must be zh or en." };
}

function safeUploadName(name: string) {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
}

function materializeSessionInboxMessage(workspaceRoot: string, runId: string, input: SendMessageInput) {
  const inboxDir = join(workspaceRoot, ".dragonboat", "runs", runId, "inbox", input.to);
  mkdirSync(inboxDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(inboxDir, `${stamp}-${safeUploadName(input.type)}.md`);
  const content = [
    "# DragonBoat Local Inbox Message",
    "",
    `- Run ID: \`${runId}\``,
    `- From: \`${input.from}\``,
    `- To: \`${input.to}\``,
    `- Task: \`${input.taskId}\``,
    `- Type: \`${input.type}\``,
    "",
    "## Body",
    "",
    input.body,
    ""
  ].join("\n");
  writeFileSync(filePath, content);
  return filePath;
}

async function parseHumanLoopInput(formData: FormData, uploadDir: string): Promise<SendHumanLoopInput | { error: string }> {
  const body = formData.get("body");
  const language = parseHumanLoopLanguage(formData.get("language"));

  if (typeof language !== "string") {
    return language;
  }

  if (typeof body !== "string" || !body.trim()) {
    return { error: "Human instruction is required." };
  }

  const attachments: HumanLoopAttachment[] = [];
  const uploadedFiles = formData.getAll("files").filter((entry): entry is File => {
    return typeof entry === "object" && entry !== null && "arrayBuffer" in entry && "name" in entry;
  });

  for (const file of uploadedFiles) {
    const fileName = `${Date.now()}-${safeUploadName(file.name)}`;
    const filePath = join(uploadDir, fileName);

    mkdirSync(uploadDir, { recursive: true });
    writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

    attachments.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      path: filePath
    });
  }

  for (const item of formData.getAll("attachments")) {
    if (typeof item !== "string") {
      continue;
    }

    const parsed = JSON.parse(item) as Partial<HumanLoopAttachment>;
    if (typeof parsed.name === "string" && typeof parsed.size === "number") {
      attachments.push({
        name: parsed.name,
        type: typeof parsed.type === "string" ? parsed.type : "application/octet-stream",
        size: parsed.size,
        path: typeof parsed.path === "string" ? parsed.path : undefined
      });
    }
  }

  return {
    body: body.trim(),
    attachments,
    language
  };
}

function parseWorkerTaskInput(value: unknown, language: DemoLanguage): ClaudeWorkerTask | { error: string } {
  if (value === null) {
    return createDefaultClaudeWorkerTask(language);
  }

  if (!value || typeof value !== "object") {
    return { error: "Worker task payload must be an object." };
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.prompt !== "undefined" && typeof payload.prompt !== "string") {
    return { error: "Worker task prompt must be a string." };
  }

  if (typeof payload.name !== "undefined" && typeof payload.name !== "string") {
    return { error: "Worker task name must be a string." };
  }

  const prompt =
    typeof payload.prompt === "undefined" ? createDefaultClaudeWorkerTask(language).prompt : payload.prompt.trim();
  const name = typeof payload.name === "undefined" ? createDefaultClaudeWorkerTask(language).name : payload.name.trim();

  if (!prompt) {
    return { error: "Worker task prompt cannot be blank." };
  }

  if (!name) {
    return { error: "Worker task name cannot be blank." };
  }

  return {
    name,
    prompt
  };
}

function parseAgentConfigInput(value: unknown): { effort?: string; model?: string } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Agent config payload must be an object." };
  }

  const payload = value as Record<string, unknown>;
  const model = typeof payload.model === "undefined" ? undefined : payload.model;
  const effort = typeof payload.effort === "undefined" ? undefined : payload.effort;

  if (typeof model !== "undefined" && typeof model !== "string") {
    return { error: "Agent model must be a string." };
  }

  if (typeof effort !== "undefined" && typeof effort !== "string") {
    return { error: "Agent effort must be a string." };
  }

  if (typeof model === "undefined" && typeof effort === "undefined") {
    return { error: "Agent config must include model or effort." };
  }

  return {
    effort,
    model
  };
}

function humanLoopPtyPrompt(input: SendHumanLoopInput) {
  const attachments = input.attachments ?? [];
  const attachmentLines = attachments.map((attachment) =>
    `- ${attachment.name}${attachment.path ? ` (${attachment.path})` : ""}`
  );
  return [
    "Human Loop 指令已从 DragonBoat Web 面板进入当前 session。",
    input.body,
    attachmentLines.length > 0 ? `附件：${attachmentLines.join("; ")}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function titleCaseRole(role: string) {
  return role
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function eventPayloadString(event: DemoRun["events"][number], key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function eventPayloadStringArray(event: DemoRun["events"][number], key: string) {
  const value = event.payload?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function archivedRowerIds(run: DemoRun) {
  const archived = new Set<string>();

  for (const event of run.events) {
    if (event.type === "crew.wave.started") {
      eventPayloadStringArray(event, "archivedAgentIds").forEach((agentId) => archived.add(agentId));
    }
    if (event.type === "crew.member.archived") {
      const agentId = eventPayloadString(event, "agentId");
      if (agentId) {
        archived.add(agentId);
      }
    }
  }

  return archived;
}

function activeAgentCount(run: DemoRun) {
  const archived = archivedRowerIds(run);
  return [run.crew.steerer, ...run.crew.rowers].filter(
    (member) => !archived.has(member.id) && !["ready", "done", "blocked", "stopped"].includes(member.status)
  ).length;
}

const CANONICAL_EVIDENCE_HANDOFFS: Record<
  string,
  { acceptedTypes: MessageType[]; from: string; message: string; to: string }
> = {
  task_backend: {
    acceptedTypes: ["contract"],
    from: "agent_backend",
    message: "agent_backend must send contract mailbox to agent_frontend before submitting task_backend evidence.",
    to: "agent_frontend"
  },
  task_frontend: {
    acceptedTypes: ["status", "review", "evidence"],
    from: "agent_frontend",
    message: "agent_frontend must send status or review mailbox to agent_qa_ops before submitting task_frontend evidence.",
    to: "agent_qa_ops"
  },
  task_qa_ops: {
    acceptedTypes: ["evidence", "review"],
    from: "agent_qa_ops",
    message: "agent_qa_ops must send evidence or review mailbox to agent_codex before submitting task_qa_ops evidence.",
    to: "agent_codex"
  }
};

function missingCanonicalEvidenceHandoff(input: { from: string; taskId: string }, mailbox: MailboxMessage[]) {
  const handoff = CANONICAL_EVIDENCE_HANDOFFS[input.taskId];

  if (!handoff || input.from !== handoff.from) {
    return null;
  }

  const sent = mailbox.some(
    (message) =>
      message.from === handoff.from &&
      message.to === handoff.to &&
      message.taskId === input.taskId &&
      handoff.acceptedTypes.includes(message.type) &&
      message.body.trim().length > 0
  );

  return sent ? null : handoff.message;
}

function parseSteererRegisterInput(value: unknown): { projectName: string; steererPid?: number; workspaceRoot: string } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Steerer registration payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const workspaceRoot = typeof payload.workspaceRoot === "string" ? resolve(payload.workspaceRoot.trim()) : "";
  const projectName =
    typeof payload.projectName === "string" && payload.projectName.trim()
      ? payload.projectName.trim()
      : workspaceRoot
        ? basename(workspaceRoot)
        : "DragonBoat project";
  const steererPid = typeof payload.steererPid === "number" ? payload.steererPid : undefined;

  if (!workspaceRoot) {
    return { error: "Workspace root is required." };
  }

  try {
    if (!statSync(workspaceRoot).isDirectory()) {
      return { error: "Workspace root must be a directory." };
    }
  } catch {
    return { error: "Workspace root does not exist." };
  }

  return {
    projectName,
    steererPid,
    workspaceRoot
  };
}

function parseRowerRoute(value: unknown): RowerRoute | undefined | { error: string } {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return { error: "Rower route must be an object." };
  }

  const payload = value as Record<string, unknown>;
  const model = typeof payload.model === "string" ? payload.model.trim() : undefined;
  const effort = typeof payload.effort === "string" ? payload.effort.trim() : undefined;
  const role = typeof payload.role === "string" ? payload.role.trim() : undefined;
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : undefined;
  const fallback = typeof payload.fallback === "string" ? payload.fallback.trim() : undefined;
  const requiredCapabilities = Array.isArray(payload.requiredCapabilities)
    ? payload.requiredCapabilities.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : typeof payload.requiredCapabilities === "string"
      ? payload.requiredCapabilities
          .split(/[,，、]+/g)
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;

  return {
    ...(effort ? { effort } : {}),
    ...(fallback === "block_if_unhealthy" || fallback === "use_text_default" ? { fallback } : {}),
    ...(model ? { model } : {}),
    ...(reason ? { reason } : {}),
    ...(requiredCapabilities?.length ? { requiredCapabilities } : {}),
    ...(role ? { role } : {})
  };
}

function parseDynamicRowerInput(value: unknown): { agentId: string; newWave: boolean; prompt: string; role: AgentRole; route?: RowerRoute } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Rower payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
  const newWave = payload.newWave === true || payload.new_wave === true;
  const role = typeof payload.role === "string" ? payload.role.trim() : "";
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";

  if (!agentId || !role || !prompt) {
    return { error: "Rower start requires agentId, role, and prompt." };
  }

  if (agentId === "agent_codex") {
    return { error: "agent_codex is reserved for the foreground steerer." };
  }

  const route = parseRowerRoute(payload.route);
  if (route && "error" in route) {
    return route;
  }

  return {
    agentId,
    newWave,
    prompt,
    ...(route ? { route } : {}),
    role
  };
}

const TERMINAL_ROWER_STATUSES = new Set(["blocked", "done", "stopped"]);

function appendRowerStartWaveArchive(engine: DemoEngine, input: { agentId: string; newWave: boolean }) {
  const run = engine.snapshot();
  const archived = archivedRowerIds(run);
  const rowersToArchive = run.crew.rowers
    .filter((rower) => rower.id !== input.agentId)
    .filter((rower) => !archived.has(rower.id))
    .filter((rower) => input.newWave || TERMINAL_ROWER_STATUSES.has(rower.status))
    .map((rower) => rower.id);

  if (!input.newWave && rowersToArchive.length === 0) {
    return;
  }

  const activeAgentIds = input.newWave
    ? [input.agentId]
    : [
        ...run.crew.rowers
          .filter((rower) => rower.id !== input.agentId)
          .filter((rower) => !archived.has(rower.id) && !rowersToArchive.includes(rower.id))
          .filter((rower) => !TERMINAL_ROWER_STATUSES.has(rower.status))
          .map((rower) => rower.id),
        input.agentId
      ];
  const waveId = `wave_${run.events.length + 1}_${input.agentId.replace(/^agent_/, "")}`;

  engine.appendCrewWaveStarted({
    activeAgentIds: [...new Set(activeAgentIds)],
    archivedAgentIds: rowersToArchive,
    reason: input.newWave ? "rower_start_new_wave" : "rower_start_archive_terminal",
    waveId
  });

  for (const agentId of rowersToArchive) {
    engine.appendCrewMemberArchived(agentId, {
      reason: input.newWave ? "new_wave" : "terminal_rower_cleanup",
      source: "rower_start",
      waveId
    });
  }
}

function parseSessionMessageInput(value: unknown): SendMessageInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Message payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const from = typeof payload.from === "string" && payload.from.trim() ? payload.from.trim() : "agent_codex";
  const taskId = typeof payload.taskId === "string" && payload.taskId.trim() ? payload.taskId.trim() : "task_general";
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  const type = typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : "instruction";

  if (!body || !to) {
    return { error: "Message body and target agent are required." };
  }

  if (!isMessageType(type)) {
    return { error: "Message type is invalid." };
  }

  return {
    body,
    from,
    taskId,
    to,
    type
  };
}

function parseAdvisorInput(value: unknown): SendAdvisorInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Advisor payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const kind = typeof payload.kind === "string" && payload.kind.trim() ? payload.kind.trim() : "advice";
  const source = typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : undefined;

  if (!body) {
    return { error: "Advisor body is required." };
  }

  if (!ADVISOR_KINDS.has(kind as AdvisorMessageKind)) {
    return { error: "Advisor kind must be advice, research, or risk." };
  }

  return {
    body,
    kind: kind as AdvisorMessageKind,
    ...(source ? { source } : {})
  };
}

function parseBroadcastMessageInput(value: unknown): SendMessageInput[] | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Broadcast payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const targets = Array.isArray(payload.to)
    ? payload.to.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : typeof payload.to === "string"
      ? payload.to.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  if (targets.length === 0) {
    return { error: "Broadcast target list is required." };
  }

  const base = parseSessionMessageInput({
    ...payload,
    to: targets[0]
  });

  if ("error" in base) {
    return base;
  }

  return targets.map((target) => ({
    ...base,
    to: target
  }));
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function parseEvidenceInput(value: unknown):
  | {
      commandsRun: string[];
      files: string[];
      from: string;
      remainingRisks: string[];
      screenshots: string[];
      sources: string[];
      status: "failed" | "passed" | "pending";
      summary: string;
      taskId: string;
      taskType?: string;
      touchedFiles: string[];
      workspaceProof?: string;
    }
  | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Evidence payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const from = typeof payload.from === "string" ? payload.from.trim() : "";
  const status = payload.status === "failed" || payload.status === "pending" ? payload.status : "passed";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  const taskType = typeof payload.taskType === "string" ? payload.taskType.trim() : "";
  const workspaceProof = typeof payload.workspaceProof === "string" ? payload.workspaceProof.trim() : "";

  if (!from || !summary || !taskId) {
    return { error: "Evidence requires from, taskId, and summary." };
  }

  return {
    commandsRun: stringList(payload.commandsRun),
    files: stringList(payload.files),
    from,
    remainingRisks: stringList(payload.remainingRisks),
    screenshots: stringList(payload.screenshots),
    sources: stringList(payload.sources),
    status,
    summary,
    taskId,
    ...(taskType ? { taskType } : {}),
    touchedFiles: stringList(payload.touchedFiles),
    ...(workspaceProof ? { workspaceProof } : {})
  };
}

function parseStructuredHandoffInput(value: unknown): StructuredHandoffInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Structured handoff payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const from = typeof payload.from === "string" ? payload.from.trim() : "";
  const recipient =
    typeof payload.recipient === "string" && payload.recipient.trim()
      ? payload.recipient.trim()
      : typeof payload.to === "string"
        ? payload.to.trim()
        : "";
  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const requiredAction =
    typeof payload.requiredAction === "string" && payload.requiredAction.trim()
      ? payload.requiredAction.trim()
      : typeof payload.required_action === "string"
        ? payload.required_action.trim()
        : "";
  const confidence = typeof payload.confidence === "string" ? payload.confidence.trim() : "";
  const claims = stringList(payload.claims);
  const sources = stringList(payload.sources);
  const openQuestions = [...stringList(payload.openQuestions), ...stringList(payload.open_questions)];

  if (!from || !recipient || !taskId || !summary || !requiredAction || claims.length === 0 || sources.length === 0 || openQuestions.length === 0) {
    return { error: "Structured handoff requires from, recipient/to, taskId, summary, claims, sources, openQuestions, and requiredAction." };
  }

  try {
    const input = {
      ackRequired: payload.ackRequired !== false && payload.ack_required !== false,
      artifactPath:
        typeof payload.artifactPath === "string" && payload.artifactPath.trim()
          ? payload.artifactPath.trim()
          : typeof payload.artifact_path === "string" && payload.artifact_path.trim()
            ? payload.artifact_path.trim()
            : undefined,
      body: typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : undefined,
      claims,
      confidence: normalizeHandoffConfidence(confidence),
      from,
      handoffId:
        typeof payload.handoffId === "string" && payload.handoffId.trim()
          ? payload.handoffId.trim()
          : createHandoffId({ from, recipient, taskId }),
      openQuestions,
      recipient,
      requiredAction,
      sources,
      summary,
      taskId
    };
    return input;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Invalid structured handoff." };
  }
}

function parseHandoffAckInput(handoffId: string, value: unknown): HandoffAckInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Handoff ack payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const ackBy = typeof payload.ackBy === "string" && payload.ackBy.trim()
    ? payload.ackBy.trim()
    : typeof payload.from === "string"
      ? payload.from.trim()
      : "";
  const note = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : undefined;
  const taskId = typeof payload.taskId === "string" && payload.taskId.trim() ? payload.taskId.trim() : undefined;
  const status = typeof payload.status === "string" ? payload.status.trim() : "";

  if (!ackBy) {
    return { error: "Handoff ack requires ackBy or from." };
  }

  try {
    return {
      ackBy,
      handoffId,
      note,
      status: normalizeHandoffAckStatus(status),
      taskId
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Invalid handoff ack." };
  }
}

function parseTaskCompleteInput(value: unknown):
  | {
      commandsRun: string[];
      evidencePath: string;
      from: string;
      handoffPath: string;
      remainingRisks: string[];
      status: "failed" | "passed" | "pending";
      summary: string;
      taskId: string;
      taskType?: string;
      to: string;
      touchedFiles: string[];
      workspaceProof?: string;
    }
  | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Task complete payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const from = typeof payload.from === "string" ? payload.from.trim() : "";
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const handoffPath = typeof payload.handoffPath === "string" ? payload.handoffPath.trim() : "";
  const evidencePath = typeof payload.evidencePath === "string" ? payload.evidencePath.trim() : "";
  const taskType = typeof payload.taskType === "string" ? payload.taskType.trim() : "";
  const workspaceProof = typeof payload.workspaceProof === "string" ? payload.workspaceProof.trim() : "";
  const status = payload.status === "failed" || payload.status === "pending" ? payload.status : "passed";

  if (!from || !to || !taskId || !summary || !handoffPath || !evidencePath) {
    return { error: "Task complete requires from, to, taskId, summary, handoffPath, and evidencePath." };
  }

  return {
    commandsRun: stringList(payload.commandsRun),
    evidencePath,
    from,
    handoffPath,
    remainingRisks: stringList(payload.remainingRisks),
    status,
    summary,
    taskId,
    ...(taskType ? { taskType } : {}),
    to,
    touchedFiles: stringList(payload.touchedFiles),
    ...(workspaceProof ? { workspaceProof } : {})
  };
}

function runWorktreeRoot(runDir: string) {
  const runsDir = dirname(runDir);
  const maybeDragonBoatDir = dirname(runsDir);

  if (maybeDragonBoatDir.endsWith(".dragonboat")) {
    return join(dirname(maybeDragonBoatDir), ".dragonboat-worktrees");
  }

  return join(runDir, ".dragonboat-worktrees");
}

function workspaceLayout(workspaceRoot: string) {
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const prefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .trim()
      .replace(/\/$/, "");

    return {
      gitRoot: gitRoot || workspaceRoot,
      relativeProjectPath: prefix
    };
  } catch {
    return {
      gitRoot: workspaceRoot,
      relativeProjectPath: ""
    };
  }
}

const WORKSPACE_OVERLAY_EXCLUDED_NAMES = new Set([
  ".dragonboat-worktrees",
  ".git",
  ".next",
  ".turbo",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

const DRAGONBOAT_RUNTIME_EXCLUDED_NAMES = new Set(["runs", "tmp", "uploads"]);
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

function shouldSkipWorkspaceOverlay(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const name = parts.at(-1);

  if (!name) {
    return false;
  }

  if (WORKSPACE_OVERLAY_EXCLUDED_NAMES.has(name)) {
    return true;
  }

  return parts[0] === ".dragonboat" && parts.length === 2 && DRAGONBOAT_RUNTIME_EXCLUDED_NAMES.has(name);
}

function copyWorkspaceOverlayEntry(source: string, target: string, relativePath: string) {
  if (shouldSkipWorkspaceOverlay(relativePath)) {
    return;
  }

  const sourceStat = lstatSync(source);

  if (sourceStat.isSymbolicLink()) {
    mkdirSync(dirname(target), { recursive: true });
    try {
      symlinkSync(readlinkSync(source), target);
    } catch {
      // Keep an existing copied entry rather than failing rower launch on a duplicate symlink.
    }
    return;
  }

  if (sourceStat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const child of readdirSync(source)) {
      copyWorkspaceOverlayEntry(join(source, child), join(target, child), join(relativePath, child));
    }
    return;
  }

  if (!sourceStat.isFile()) {
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, sourceStat.mode);
}

function syncWorkspaceOverlay(sourceRoot: string, targetRoot: string) {
  mkdirSync(targetRoot, { recursive: true });

  for (const entry of readdirSync(sourceRoot)) {
    copyWorkspaceOverlayEntry(join(sourceRoot, entry), join(targetRoot, entry), entry);
  }
}

function ensureDynamicRowerCwd(workspaceRoot: string, runDir: string, runId: string, agentId: string) {
  const layout = workspaceLayout(workspaceRoot);
  const worktreeDir = join(runWorktreeRoot(runDir), runId, agentId);

  if (!existsSync(join(worktreeDir, ".git"))) {
    mkdirSync(dirname(worktreeDir), {
      recursive: true
    });

    try {
      execFileSync("git", ["worktree", "add", "--detach", worktreeDir, "HEAD"], {
        cwd: layout.gitRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      mkdirSync(worktreeDir, {
        recursive: true
      });
    }
  }

  syncWorkspaceOverlay(layout.gitRoot, worktreeDir);

  const cwd = layout.relativeProjectPath ? join(worktreeDir, layout.relativeProjectPath) : worktreeDir;
  mkdirSync(cwd, {
    recursive: true
  });

  return cwd;
}

function firstCrewLoopGuardrail(agentId: string) {
  const guardrails: Record<string, string[]> = {
    agent_backend: [
      "Acceptance mailbox: write the API/runtime contract to `.dragonboat/handoffs/agent_backend_to_agent_frontend_contract.md`, then send it through durable mailbox.",
      "Run: `.dragonboat/bin/dragonboat message send --from agent_backend --to agent_frontend --task task_backend --type contract --body \"<contract summary and handoff path>\"`.",
      "Do not wait for `agent_frontend` to be running. DragonBoat mailbox is durable and the frontend rower can consume the event and handoff file after it starts.",
      "When the backend slice is reviewable, run: `.dragonboat/bin/dragonboat evidence submit --from agent_backend --task task_backend --summary \"<what passed, checks run, risks>\"`."
    ],
    agent_frontend: [
      "Acceptance mailbox: consume the backend contract from mailbox/handoff history before implementation assumptions are finalized.",
      "If the backend contract is missing or ambiguous, ask through durable mailbox instead of guessing.",
      "After the UI/command-deck slice is reviewable, write `.dragonboat/handoffs/agent_frontend_to_agent_qa_ops_status.md`, then run: `.dragonboat/bin/dragonboat message send --from agent_frontend --to agent_qa_ops --task task_frontend --type status --body \"<user path, tests, handoff path, risks>\"`.",
      "Do not wait for `agent_qa_ops` to be running. DragonBoat mailbox is durable and QA/Ops can consume the event and handoff file after it starts.",
      "Then run: `.dragonboat/bin/dragonboat evidence submit --from agent_frontend --task task_frontend --summary \"<what passed, checks run, risks>\"`."
    ],
    agent_qa_ops: [
      "Acceptance mailbox: review backend and frontend mailbox/handoff history before final acceptance.",
      "Ask missing backend/frontend questions through durable mailbox instead of silently assuming.",
      "After rehearsal, write `.dragonboat/evidence/agent_qa_ops_first_crew_loop_review.md`, then run: `.dragonboat/bin/dragonboat message send --from agent_qa_ops --to agent_codex --task task_qa_ops --type evidence --body \"<pass/fail, evidence path, remaining risks>\"`.",
      "Then run: `.dragonboat/bin/dragonboat evidence submit --from agent_qa_ops --task task_qa_ops --summary \"<acceptance result, checks run, risks>\"`."
    ]
  };

  return guardrails[agentId];
}

function withFirstCrewLoopGuardrails(agentId: string, prompt: string) {
  const guardrail = firstCrewLoopGuardrail(agentId);

  if (!guardrail) {
    return prompt;
  }

  return [
    prompt.trimEnd(),
    "",
    "## DragonBoat First Crew Loop Guardrails",
    "",
    "These rules are injected by DragonBoat because this canonical rower participates in the First Crew Loop acceptance path.",
    "DragonBoat mailbox is durable: a message is valid even when the target rower is not currently running, because it is recorded in the session event ledger and visible in the command deck.",
    "",
    ...guardrail.map((line) => `- ${line}`),
    ""
  ].join("\n");
}

function dynamicClaudeArgs(
  agentId: string,
  env: Record<string, string | undefined>,
  prompt: string,
  config?: { effort?: string; model?: string }
) {
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--name",
    agentId,
    "--session-id",
    randomUUID(),
    "--permission-mode",
    env.DRAGONBOAT_CLAUDE_PERMISSION_MODE ?? DEFAULT_CLAUDE_ROWER_PERMISSION_MODE,
    `--allowedTools=${env.DRAGONBOAT_CLAUDE_ALLOWED_TOOLS ?? CLAUDE_ROWER_ALLOWED_TOOLS}`
  ];

  if (config?.model) {
    args.push("--model", config.model);
  }

  if (config?.effort) {
    args.push("--effort", config.effort);
  }

  args.push(prompt);

  return args;
}

interface DemoApiDependencies {
  claudeRouteHealthCheck?: typeof checkClaudeRouteHealth;
  clock?: () => string;
  crewPtyManager?: CrewPtyAdapter;
  env?: Record<string, string | undefined>;
  eventRecordPath?: string | null;
  replayExporter?: ReplayExporter;
  replayOutputDir?: string;
  runStoreDir?: string;
  sessionStore?: CrewSessionStore;
  nativeDirectoryChooser?: () => Promise<string>;
  seedDefaultSession?: boolean;
  workspaceRoot?: string;
  worktreeFactory?: StartFullstackCliRunInput["worktreeFactory"];
  terminalHub?: TerminalHub;
  uploadDir?: string;
  workerRunner?: WorkerCommandRunner;
  workerCwd?: string;
}

export function createDemoApi(dependencies: DemoApiDependencies = {}) {
  const app = new Hono();
  const runtimeEnv = dependencies.env ?? process.env;
  const configuredWorkspaceRoot = resolve(
    dependencies.workspaceRoot ?? runtimeEnv.DRAGONBOAT_WORKSPACE_ROOT?.trim() ?? process.cwd()
  );
  const terminalHub = dependencies.terminalHub ?? new TerminalHub();
  const crewPtyManager = dependencies.crewPtyManager ?? new CrewPtyManager({ terminalHub });
  const defaultRunStoreDir =
    !dependencies.runStoreDir && process.env.VITEST ? mkdtempSync(join(tmpdir(), "dragonboat-demo-runs-")) : undefined;
  const sessionStore =
    dependencies.sessionStore ??
    new CrewSessionStore({
      clock: dependencies.clock,
      eventRecordPath: dependencies.eventRecordPath,
      rootDir: dependencies.runStoreDir ?? defaultRunStoreDir,
      workspaceEventRecords: !process.env.VITEST
    });
  const packageDir = process.cwd();
  const replayOutputDir = dependencies.replayOutputDir ?? join(packageDir, ".dragonboat", "exports");
  const replayExporter = dependencies.replayExporter ?? createRemotionReplayExporter();
  const claudeRouteHealthCheck = dependencies.claudeRouteHealthCheck ?? checkClaudeRouteHealth;
  const shouldCheckClaudeRoute =
    runtimeEnv.DRAGONBOAT_CLAUDE_ROUTE_CHECK !== "0" && (!process.env.VITEST || Boolean(dependencies.claudeRouteHealthCheck));
  const workerRunner = dependencies.workerRunner ?? createClaudeCodeWorkerRunner();
  const workerCwd = dependencies.workerCwd ?? process.env.DRAGONBOAT_WORKER_CWD ?? process.cwd();
  const activeEngine = () => sessionStore.getActiveEngine();
  const requireActiveEngine = () => {
    const engine = activeEngine();
    if (!engine) {
      throw new Error("No active DragonBoat session. Choose a workspace folder first.");
    }

    return engine;
  };
  const activeUploadDir = () => {
    const activeRunId = sessionStore.activeRunId();
    return dependencies.uploadDir ?? join(sessionStore.runDir(activeRunId ?? "pending"), "uploads");
  };

  const shouldSeedDefaultSession = dependencies.seedDefaultSession ?? Boolean(process.env.VITEST);

  if (shouldSeedDefaultSession && !dependencies.runStoreDir && !dependencies.sessionStore) {
    sessionStore.ensureDefaultSession({ forceActive: true });
  }

  app.get("/api/health", (context) =>
    context.json({
      activeRunId: sessionStore.activeRunId(),
      runStoreDir: dependencies.runStoreDir ?? null,
      sessionCount: sessionStore.listSessions().length,
      status: "ok",
      workspaceRoot: configuredWorkspaceRoot
    })
  );

  function eventStream(engine: DemoEngine) {
    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => undefined;

    const stream = new ReadableStream({
      start(controller) {
        for (const event of engine.listEvents()) {
          controller.enqueue(encoder.encode(toSseEvent(event)));
        }

        unsubscribe = engine.subscribe((event) => {
          controller.enqueue(encoder.encode(toSseEvent(event)));
        });
      },
      cancel() {
        unsubscribe();
      }
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive"
      }
    });
  }

  function mirrorEventsToTerminals(runId: string, events: ReturnType<DemoEngine["listEvents"]>) {
    for (const event of events) {
      if (event.type === "command.started") {
        const command = typeof event.payload?.command === "string" ? event.payload.command : "";
        const args = Array.isArray(event.payload?.args)
          ? event.payload.args.filter((item): item is string => typeof item === "string")
          : [];
        terminalHub.append(runId, event.actor, `$ ${[command, ...args].filter(Boolean).join(" ")}\n`);
      }

      if (event.type === "command.output") {
        const agentId = typeof event.payload?.agentId === "string" ? event.payload.agentId : event.actor;
        const line = typeof event.payload?.line === "string" ? event.payload.line : "";
        if (line) {
          terminalHub.append(runId, agentId, `[${agentId}] ${line}\n`);
        }
      }

      if (event.type === "command.finished") {
        const agentId = typeof event.payload?.agentId === "string" ? event.payload.agentId : event.actor;
        const exitCode = typeof event.payload?.exitCode === "number" ? event.payload.exitCode : "unknown";
        terminalHub.append(runId, agentId, `[${agentId}] command finished exitCode=${exitCode}\n`);
      }
    }
  }

  function agentConfigStore(runId: string) {
    return new AgentConfigStore({
      clock: dependencies.clock,
      runDir: sessionStore.runDir(runId)
    });
  }

  async function ensureRealCrewRunning(
    runId: string,
    engine: DemoEngine,
    language: DemoLanguage,
    options: { startupMode?: StartFullstackCliRunInput["startupMode"] } = {}
  ) {
    if (crewPtyManager.isRunning(runId, "agent_codex")) {
      return engine.snapshot();
    }

    sessionStore.setSessionPhase(runId, "running", 4);

    try {
      const snapshot = await startFullstackCliRun({
        crewPtyManager,
        engine,
        env: runtimeEnv,
        language,
        repoRoot: sessionStore.workspaceRoot(runId) ?? packageDir,
        runDir: sessionStore.runDir(runId),
        runId,
        startupMode: options.startupMode,
        terminalHub,
        worktreeFactory: dependencies.worktreeFactory
      });
      const activeAgentCount = [
        snapshot.crew.steerer,
        ...snapshot.crew.rowers
      ].filter((member) => !["ready", "done", "blocked"].includes(member.status)).length;
      sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount);
      return snapshot;
    } catch (cause) {
      sessionStore.setSessionPhase(runId, "ready", 1);
      throw cause;
    }
  }

  app.get("/api/run", (context) => {
    const engine = activeEngine();

    if (!engine) {
      return context.json({ error: "No active DragonBoat session. Choose a workspace folder first." }, 404);
    }

    return context.json(engine.snapshot());
  });

  app.get("/api/events", (context) => {
    const engine = activeEngine();

    if (!engine) {
      return context.json([], 200);
    }

    return context.json(engine.listEvents());
  });

  app.get("/api/events/stream", (context) => {
    const engine = activeEngine();

    if (!engine) {
      return context.json({ error: "No active DragonBoat session. Choose a workspace folder first." }, 404);
    }

    return eventStream(engine);
  });

  app.get("/api/filesystem/directories", (context) => {
    const path = context.req.query("path") ?? null;

    try {
      return context.json(listWorkspaceDirectories(path));
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unable to list directories." }, 400);
    }
  });

  app.post("/api/filesystem/choose-directory", async (context) => {
    try {
      const path = await (dependencies.nativeDirectoryChooser ?? (() => chooseNativeWorkspaceDirectory()))();
      return context.json({ path });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to choose workspace folder.";
      return context.json({ error: message }, message.includes("cancelled") ? 409 : 500);
    }
  });

  app.get("/api/sessions", (context) =>
    context.json({
      activeRunId: sessionStore.activeRunId(),
      sessions: sessionStore.listSessions()
    })
  );

  app.post("/api/sessions", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const input = parseSessionInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    const session = sessionStore.createSession(input);

    return context.json(
      {
        activeRunId: session.runId,
        session,
        sessions: sessionStore.listSessions()
      },
      201
    );
  });

  app.post("/api/steerer/register", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const input = parseSteererRegisterInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    const session = sessionStore.createSession({
      title: input.projectName,
      workspaceRoot: input.workspaceRoot
    });
    const engine = sessionStore.getEngine(session.runId);
    const run = engine.registerSteerer({
      pid: input.steererPid,
      projectName: input.projectName,
      workspaceRoot: input.workspaceRoot
    });
    const nextSession = sessionStore.setSessionPhase(session.runId, "running", activeAgentCount(run) || 1);

    return context.json(
      {
        run,
        runId: session.runId,
        session: nextSession,
        sessions: sessionStore.listSessions()
      },
      201
    );
  });

  app.delete("/api/sessions/:runId", (context) => {
    const runId = context.req.param("runId");

    try {
      sessionStore.deleteSession(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unable to delete session." }, 404);
    }

    return context.json({
      activeRunId: sessionStore.activeRunId(),
      sessions: sessionStore.listSessions()
    });
  });

  app.get("/api/sessions/:runId", (context) => {
    const runId = context.req.param("runId");
    const engine = sessionStore.setActiveRun(runId);

    return context.json(engine.snapshot());
  });

  app.post("/api/sessions/:runId/reconcile", (context) => {
    const runId = context.req.param("runId");
    let engine;

    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    const importedEvents = engine.reconcilePersistedEvents({ broadcast: true });
    const snapshot = engine.snapshot();
    sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount(snapshot) || 1);

    return context.json({
      importedEventCount: importedEvents.length,
      run: snapshot
    });
  });

  app.get("/api/sessions/:runId/context-bundle", (context) => {
    const runId = context.req.param("runId");
    const agentId = context.req.query("agentId")?.trim();
    const taskId = context.req.query("taskId")?.trim() || undefined;

    if (!agentId) {
      return context.json({ error: "Missing required agentId query parameter." }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    return context.json(
      createContextBundle(engine.snapshot(), {
        agentId,
        createdAt: dependencies.clock?.(),
        taskId
      })
    );
  });

  app.post("/api/sessions/:runId/rowers", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseDynamicRowerInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    appendRowerStartWaveArchive(engine, {
      agentId: input.agentId,
      newWave: input.newWave
    });

    const roleLabel = titleCaseRole(input.role);
    const taskId = `task_${input.role}`;
    const workspaceRoot = sessionStore.workspaceRoot(runId);
    const workspaceRunDir = join(workspaceRoot, ".dragonboat", "runs", runId);
    const cwd = ensureDynamicRowerCwd(workspaceRoot, workspaceRunDir, runId, input.agentId);
    const agentConfig = isCrewAgentId(input.agentId)
      ? agentConfigStore(runId).loadOrCreate({
          env: runtimeEnv
        })[input.agentId]
      : undefined;
    const selectedConfig = {
      effort: input.route?.effort ?? agentConfig?.effort,
      model: input.route?.model ?? agentConfig?.model
    };
    const routeDecision = {
      agentId: input.agentId,
      effort: selectedConfig.effort ?? runtimeEnv.DRAGONBOAT_CLAUDE_EFFORT,
      fallback: input.route?.fallback,
      model: selectedConfig.model ?? runtimeEnv.DRAGONBOAT_CLAUDE_MODEL ?? runtimeEnv.ANTHROPIC_MODEL,
      reason:
        input.route?.reason ??
        (agentConfig
          ? "DragonBoat used the stored per-run agent configuration."
          : "DragonBoat used the provider or environment default route."),
      requiredCapabilities: input.route?.requiredCapabilities ?? ["text"],
      role: input.route?.role ?? input.role,
      source: input.route ? "task_packet_route" : agentConfig ? "agent_config" : "provider_default",
      taskId
    };
    const rowerPrompt = withFirstCrewLoopGuardrails(input.agentId, input.prompt);
    const command = resolveClaudeCommand(runtimeEnv);
    const args = dynamicClaudeArgs(input.agentId, runtimeEnv, rowerPrompt, selectedConfig);
    const ptyEnv = {
      ...runtimeEnv,
      DRAGONBOAT_AGENT_ID: input.agentId,
      DRAGONBOAT_API_URL: runtimeEnv.DRAGONBOAT_API_URL ?? "http://127.0.0.1:8787",
      DRAGONBOAT_RUN_ID: runId,
      DRAGONBOAT_WORKSPACE_ROOT: sessionStore.workspaceRoot(runId)
    };

    if (shouldCheckClaudeRoute) {
      const health = await claudeRouteHealthCheck({
        command,
        cwd,
        effort: selectedConfig.effort ?? runtimeEnv.DRAGONBOAT_CLAUDE_EFFORT,
        env: ptyEnv,
        model: selectedConfig.model ?? runtimeEnv.DRAGONBOAT_CLAUDE_MODEL ?? runtimeEnv.ANTHROPIC_MODEL
      }).catch((cause): ClaudeRouteHealthResult => {
        const message = cause instanceof Error ? cause.message : "Claude route health check failed.";
        return {
          command,
          durationMs: 0,
          exitCode: 1,
          message,
          model: selectedConfig.model ?? runtimeEnv.DRAGONBOAT_CLAUDE_MODEL ?? runtimeEnv.ANTHROPIC_MODEL,
          ok: false,
          raw: message,
          signal: null
        };
      });

      if (!health.ok) {
        const message = `Claude route check failed before rower start: ${health.message}`;

        engine.registerCrewMember({
          agentId: input.agentId,
          name: `${roleLabel} Rower`,
          platform: "claude_code_cli",
          role: input.role,
          status: "blocked"
        });
        engine.appendTaskPacket({
          owner: input.agentId,
          role: input.role,
          status: "blocked",
          taskId,
          title: `${roleLabel} task`
        });
        engine.appendRouteDecision(routeDecision);
        engine.appendCommandStarted(
          input.agentId,
          "dragonboat",
          [
            "claude-route-check",
            "--command",
            health.command,
            "--model",
            health.model ?? "provider-default"
          ],
          cwd
        );
        engine.appendCommandOutput(input.agentId, message);
        if (health.raw && health.raw !== health.message) {
          engine.appendCommandOutput(input.agentId, health.raw);
        }
        engine.appendCommandFinished(input.agentId, health.exitCode ?? 78, health.signal ?? null);
        engine.appendMailboxMessage({
          body: message,
          from: "agent_codex",
          taskId,
          to: input.agentId,
          type: "blocker"
        });

        const snapshot = engine.snapshot();
        const session = sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount(snapshot) || 1);
        return context.json(
          {
            error: message,
            health,
            run: snapshot,
            runId,
            session,
            sessions: sessionStore.listSessions()
          },
          503
        );
      }
    }

    engine.registerCrewMember({
      agentId: input.agentId,
      name: `${roleLabel} Rower`,
      platform: "claude_code_cli",
      role: input.role,
      status: "running"
    });
    engine.appendTaskPacket({
      owner: input.agentId,
      role: input.role,
      status: "running",
      taskId,
      title: `${roleLabel} task`
    });
    engine.appendRouteDecision(routeDecision);

    try {
      await crewPtyManager.startAgent({
        agentId: input.agentId,
        args,
        command,
        cwd,
        engine,
        env: ptyEnv,
        runId
      });
      engine.appendMailboxMessage({
        body: rowerPrompt,
        from: "agent_codex",
        taskId,
        to: input.agentId,
        type: "instruction"
      });
    } catch (cause) {
      engine.appendCrewStatus(input.agentId, "blocked");
      const snapshot = engine.snapshot();
      sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount(snapshot) || 1);
      return context.json({ error: cause instanceof Error ? cause.message : "Unable to start rower." }, 500);
    }

    const snapshot = engine.snapshot();
    sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount(snapshot) || 1);
    return context.json(snapshot, 201);
  });

  app.delete("/api/sessions/:runId/rowers/:agentId", (context) => {
    const runId = context.req.param("runId");
    const agentId = context.req.param("agentId");

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    const beforeArchive = engine.snapshot();
    const rower = beforeArchive.crew.rowers.find((member) => member.id === agentId);

    if (!rower) {
      return context.json({ error: "Unknown rower." }, 404);
    }

    if (!TERMINAL_ROWER_STATUSES.has(rower.status)) {
      crewPtyManager.stopAgent?.(runId, agentId);
      engine.appendCrewStatus(agentId, "stopped");
      const task = beforeArchive.tasks.find((item) => item.owner === agentId);
      if (task) {
        engine.appendTaskStatusChange(task.id, agentId, "stopped", task.progress);
      }
    }

    engine.appendCrewMemberArchived(agentId, {
      reason: "manual_archive",
      source: "api_delete"
    });
    const snapshot = engine.snapshot();
    sessionStore.setSessionPhase(runId, snapshot.phase, activeAgentCount(snapshot) || 1);

    return context.json(snapshot);
  });

  app.post("/api/sessions/:runId/messages", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseSessionMessageInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    const snapshot = engine.appendMailboxMessage(input);
    const injected = crewPtyManager.write(runId, input.to, `${input.body}\r`, {
      echo: `[${input.from} -> ${input.to}] ${input.body}`
    });
    if (injected === false) {
      materializeSessionInboxMessage(sessionStore.workspaceRoot(runId), runId, input);
    }

    return context.json(snapshot, 201);
  });

  app.post("/api/sessions/:runId/advisor", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseAdvisorInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    return context.json(engine.appendAdvisorMessage(input), 201);
  });

  app.post("/api/sessions/:runId/messages/broadcast", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const inputs = parseBroadcastMessageInput(payload);

    if ("error" in inputs) {
      return context.json({ error: inputs.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    let snapshot = engine.snapshot();
    for (const input of inputs) {
      snapshot = engine.appendMailboxMessage(input);
      const injected = crewPtyManager.write(runId, input.to, `${input.body}\r`, {
        echo: `[${input.from} -> ${input.to}] ${input.body}`
      });
      if (injected === false) {
        materializeSessionInboxMessage(sessionStore.workspaceRoot(runId), runId, input);
      }
    }

    return context.json(snapshot, 201);
  });

  app.post("/api/sessions/:runId/handoffs", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseStructuredHandoffInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    const snapshot = engine.appendStructuredHandoff(input);
    const message = snapshot.mailbox.at(-1);
    if (message) {
      const injected = crewPtyManager.write(runId, input.recipient, `${message.body}\r`, {
        echo: `[${input.from} -> ${input.recipient}] ${input.summary}`
      });
      if (injected === false) {
        materializeSessionInboxMessage(sessionStore.workspaceRoot(runId), runId, message);
      }
    }

    return context.json(snapshot, 201);
  });

  app.post("/api/sessions/:runId/handoffs/:handoffId/ack", async (context) => {
    const runId = context.req.param("runId");
    const handoffId = context.req.param("handoffId");
    const payload = await context.req.json().catch(() => null);
    const input = parseHandoffAckInput(handoffId, payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    try {
      const engine = sessionStore.setActiveRun(runId);
      return context.json(engine.appendHandoffAck(input), 201);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }
  });

  app.post("/api/sessions/:runId/task-complete", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseTaskCompleteInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    try {
      const engine = sessionStore.setActiveRun(runId);
      return context.json(
        engine.completeTask({
          actor: input.from,
          commandsRun: input.commandsRun,
          evidencePath: input.evidencePath,
          handoffPath: input.handoffPath,
          remainingRisks: input.remainingRisks,
          status: input.status,
          summary: input.summary,
          taskId: input.taskId,
          taskType: input.taskType as Parameters<DemoEngine["completeTask"]>[0]["taskType"],
          touchedFiles: input.touchedFiles,
          workspaceProof: input.workspaceProof
        }),
        201
      );
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }
  });

  app.post("/api/sessions/:runId/evidence", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const input = parseEvidenceInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    try {
      engine = sessionStore.setActiveRun(runId);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }

    const missingHandoff = missingCanonicalEvidenceHandoff(input, engine.snapshot().mailbox);
    if (missingHandoff) {
      return context.json({ error: missingHandoff }, 409);
    }

    const snapshot = engine.submitEvidence({
      actor: input.from,
      commandsRun: input.commandsRun,
      files: input.files,
      remainingRisks: input.remainingRisks,
      screenshots: input.screenshots,
      sources: input.sources,
      status: input.status,
      summary: input.summary,
      taskId: input.taskId,
      taskType: input.taskType,
      touchedFiles: input.touchedFiles,
      workspaceProof: input.workspaceProof
    });

    return context.json(snapshot, 201);
  });

  app.get("/api/sessions/:runId/events/stream", (context) => {
    const engine = sessionStore.getEngine(context.req.param("runId"));
    return eventStream(engine);
  });

  app.get("/api/sessions/:runId/terminal/:agentId", (context) => {
    const runId = context.req.param("runId");
    const agentId = context.req.param("agentId");

    return context.json({
      buffer: terminalHub.snapshot(runId, agentId)
    });
  });

  app.get("/api/sessions/:runId/readable-projection/:agentId", (context) => {
    const runId = context.req.param("runId");
    const agentId = context.req.param("agentId");

    try {
      const engine = sessionStore.setActiveRun(runId);
      return context.json(projectRowerOutput(engine.listEvents(), agentId));
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unknown session." }, 404);
    }
  });

  app.get("/api/sessions/:runId/agent-config", (context) => {
    const runId = context.req.param("runId");

    try {
      sessionStore.getEngine(runId);
      return context.json({
        configs: agentConfigStore(runId).loadOrCreate({
          env: runtimeEnv
        })
      });
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "Unable to load agent config." }, 404);
    }
  });

  app.patch("/api/sessions/:runId/agents/:agentId/config", async (context) => {
    const runId = context.req.param("runId");
    const agentId = context.req.param("agentId");
    const payload = await context.req.json().catch(() => null);
    const input = parseAgentConfigInput(payload);

    if (!isCrewAgentId(agentId)) {
      return context.json({ error: "Unknown DragonBoat agent." }, 404);
    }

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    try {
      const engine = sessionStore.getEngine(runId);
      const configs = agentConfigStore(runId).update(agentId, input);
      if (crewPtyManager.isRunning(runId, agentId)) {
        for (const command of configCommands(input)) {
          crewPtyManager.write(runId, agentId, command.text, {
            echo: command.echo
          });
        }
      }
      engine.appendAgentConfigUpdated(agentId, input);

      return context.json({
        config: configs[agentId],
        configs
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to update agent config.";
      if (message.includes("effort must be one of")) {
        return context.json({ error: message }, 400);
      }
      return context.json({ error: message }, 404);
    }
  });

  app.post("/api/sessions/:runId/start-fullstack-case", async (context) => {
    const runId = context.req.param("runId");
    const payload = await context.req.json().catch(() => null);
    const language = parseLanguage(payload);

    if (typeof language !== "string") {
      return context.json({ error: language.error }, 400);
    }

    const engine = sessionStore.setActiveRun(runId);
    let snapshot;
    try {
      snapshot = await ensureRealCrewRunning(runId, engine, language);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to start real CLI crew.";
      return context.json({ error: message }, message.includes("disabled") ? 409 : 500);
    }

    return context.json(snapshot, 201);
  });

  app.post("/api/demo-run", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const language = parseLanguage(payload);

    if (typeof language !== "string") {
      return context.json({ error: language.error }, 400);
    }

    try {
      return context.json(requireActiveEngine().runSimulatedCrew(language), 201);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }
  });

  app.post("/api/fullstack-case", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const language = parseLanguage(payload);

    if (typeof language !== "string") {
      return context.json({ error: language.error }, 400);
    }

    try {
      return context.json(requireActiveEngine().runFullstackCase(language), 201);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }
  });

  app.post("/api/worker-run", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const language = parseLanguage(payload);

    if (typeof language !== "string") {
      return context.json({ error: language.error }, 400);
    }

    const task = parseWorkerTaskInput(payload, language);

    if ("error" in task) {
      return context.json({ error: task.error }, 400);
    }

    let snapshot;
    try {
      snapshot = await requireActiveEngine().runClaudeWorker(workerRunner, workerCwd, task, language);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }

    return context.json(snapshot, 201);
  });

  app.post("/api/replay/export", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const language = parseLanguage(payload);

    if (typeof language !== "string") {
      return context.json({ error: language.error }, 400);
    }

    let result;
    try {
      result = await replayExporter({
        events: requireActiveEngine().listEvents(),
        language,
        outputDir: replayOutputDir,
        packageDir
      });
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }

    return context.json(
      {
        fileName: result.fileName,
        filePath: result.filePath,
        downloadUrl: `/api/replay/download/${encodeURIComponent(result.fileName)}`
      },
      201
    );
  });

  app.get("/api/replay/download/:fileName", (context) => {
    const fileName = basename(context.req.param("fileName"));
    const filePath = join(replayOutputDir, fileName);
    const bytes = readFileSync(filePath);

    return new Response(bytes, {
      headers: {
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-type": "video/mp4"
      }
    });
  });

  app.post("/api/messages", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const input = parseMessageInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    try {
      return context.json(requireActiveEngine().sendMessage(input), 201);
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }
  });

  app.post("/api/human-loop", async (context) => {
    const formData = await context.req.formData().catch(() => null);

    if (!formData) {
      return context.json({ error: "Human loop payload must be multipart form data." }, 400);
    }

    const input = await parseHumanLoopInput(formData, activeUploadDir());

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    let engine;
    let runId;
    try {
      engine = requireActiveEngine();
      runId = sessionStore.activeRunId() ?? engine.snapshot().runId;
    } catch (cause) {
      return context.json({ error: cause instanceof Error ? cause.message : "No active session." }, 409);
    }

    if (runtimeEnv.DRAGONBOAT_ENABLE_REAL_CLI === "1") {
      return context.json(
        {
          error:
            "Web human-loop injection is disabled for foreground Codex sessions. Send follow-up instructions in the native Codex CLI."
        },
        409
      );
    }

    const previousEventCount = engine.listEvents().length;
    const snapshot = engine.sendHumanLoop(input);
    mirrorEventsToTerminals(snapshot.runId, snapshot.events.slice(previousEventCount));

    return context.json(snapshot, 201);
  });

  return app;
}
