import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInitialDemoRun } from "../shared/seed";
import { evaluateEvidenceGate, type EvidenceTaskType } from "../shared/evidenceGate";
import { createHandoffId } from "../shared/structuredHandoff";
import type {
  AgentPlatform,
  AgentRole,
  AgentLog,
  AgentStatus,
  AdvisorMessageKind,
  CrewMember,
  DemoEvent,
  DemoEventType,
  DemoLanguage,
  DemoRun,
  EvidenceItem,
  HumanLoopAttachment,
  HandoffAckInput,
  MailboxMessage,
  SendAdvisorInput,
  SendHumanLoopInput,
  SendMessageInput,
  StructuredHandoffInput,
  TaskStatus
} from "../shared/types";
import type { WorkerCommandRunner } from "./claudeWorkerRunner";

type EventSubscriber = (event: DemoEvent) => void;

interface AppendEventInput {
  type: DemoEventType;
  actor: string;
  createdAt?: string;
  taskId?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
}

export const DEFAULT_RUN_ID = "run_demo_web_loop";
const SEED_DATE = "2026-05-18T09:30:00.000Z";
const REAL_WORKER_PROMPT = [
  "你是 DragonBoat 本地演示中的 QA/Ops 划手。",
  "不要修改文件。",
  "请用中文返回一条简短证据，证明 Claude Code worker 进程已经被成功唤起。"
].join(" ");

const EN_REAL_WORKER_PROMPT = [
  "You are the DragonBoat QA/Ops rower for the local demo.",
  "Do not modify files.",
  "Return a short evidence note proving the Claude Code worker process ran."
].join(" ");

const text = {
  en: {
    acceptedFullstackTarget:
      "Codex accepted the target in cases/fullstack-collab-app: build registration/login, boards, lists, card drag-sort, API integration, and automated tests.",
    acceptedRun:
      "Codex monitored all mailbox handoffs, reviewed handoffs/agent_qa_ops_to_agent_codex_evidence.md, and accepted the fullstack collaboration run.",
    apiContractEvidence: "Auth and kanban API contracts handed to frontend",
    backendContractRecorded: "Backend contract handoff recorded",
    backendReadSkill:
      "Backend Rower read docs/skills/dragonboat-rower.md and prepared auth plus board/list/card contracts.",
    backendToFrontendContract:
      "Diff handoff handoffs/agent_backend_to_agent_frontend_api.diff: API ready: POST /api/auth/register, POST /api/auth/login, GET /api/boards, POST /api/boards, POST /api/lists/reorder, POST /api/cards/reorder. Auth returns {token,user}; reorder accepts ordered ids.",
    codexApprovedSimulatedRun: "Codex approved rower evidence and accepted the run.",
    codexDispatchingWorker: "Codex steerer dispatching Claude Code QA/Ops worker.",
    codexReadSteererSkill: "Codex read docs/skills/dragonboat-steerer.md before dispatching the crew.",
    codexSplitTasks: "Codex split the run into frontend, backend, and QA/Ops rower tasks.",
    finalAccepted: "Fullstack collaboration app accepted",
    frontendIntegratedEvidence: "Kanban UI integrated with API contract",
    frontendReadied:
      "Frontend Rower wired auth screens, kanban board shell, and drag state, then checked backend reorder assumptions.",
    frontendToBackendQuestion:
      "Diff handoff handoffs/agent_frontend_to_agent_backend_question.diff: For card reorder, should cross-list movement call POST /api/cards/reorder with sourceListId, targetListId, and ordered card ids?",
    frontendToQaEvidence:
      "Diff handoff handoffs/agent_frontend_to_agent_qa_ops_ui.diff: Frontend evidence: register/login flow renders, boards load from API, lists and cards support drag-and-drop reorder with backend contract above.",
    fullstackTestsPassed: "Fullstack auth and drag-sort tests passed",
    qaReadied:
      "QA/Ops Rower read handoffs/agent_frontend_to_agent_qa_ops_ui.diff and ran integration checks for auth, board loading, list reorder, card reorder, and API error handling.",
    qaRequest:
      "QA/Ops request: provide the drag-and-drop path and expected persistence check so automated tests can verify the card order after reload.",
    qaChecks: "QA/Ops checks passed",
    qaVerifiedHandoff: "QA/Ops Rower verified the handoff path and evidence queue.",
    rowerSkillAttached:
      "Codex attached docs/skills/dragonboat-rower.md to backend, frontend, and QA/Ops task packets.",
    seedHandoff: "Prepare the first contract handoff for the frontend rower.",
    simulatedBackendContract: "GET /api/run returns crew, tasks, mailbox, and evidence arrays.",
    simulatedBackendPublished: "Backend Rower published the /api/run contract for the frontend.",
    simulatedFrontendRendered: "Frontend Rower rendered the command deck state from the API contract.",
    steererReviewAccepted: "Steerer review accepted",
    taskBackend:
      "Task packet: implement auth, boards, lists, cards, and reorder APIs. Read docs/skills/dragonboat-rower.md and send API contracts to frontend immediately.",
    taskFrontend:
      "Task packet: implement login/register, kanban board UI, list/card drag sorting. Read docs/skills/dragonboat-rower.md and ask backend before guessing API shapes.",
    yesReorder:
      "Yes. For card reorder send {sourceListId,targetListId,orderedCardIds}; same-list moves may reuse sourceListId as targetListId. Errors return {error}.",
    workerCompleted: "Claude worker completed",
    workerFailed: "Claude worker failed"
  },
  zh: {
    acceptedFullstackTarget:
      "Codex 已接收 cases/fullstack-collab-app 的目标：构建注册登录、看板、列表、卡片拖拽排序、前后端接口联调和自动化测试。",
    acceptedRun:
      "Codex 已监听全部 mailbox 交接，审阅 handoffs/agent_qa_ops_to_agent_codex_evidence.md，并接受这次全栈协作交付。",
    apiContractEvidence: "认证与看板 API 契约已交给前端",
    backendContractRecorded: "后端契约交接已记录",
    backendReadSkill: "后端划手已读取 docs/skills/dragonboat-rower.md，并准备好认证与看板/列表/卡片接口契约。",
    backendToFrontendContract:
      "Diff 交接 handoffs/agent_backend_to_agent_frontend_api.diff：API 已可用：POST /api/auth/register、POST /api/auth/login、GET /api/boards、POST /api/boards、POST /api/lists/reorder、POST /api/cards/reorder。认证返回 {token,user}；排序接口接收有序 id。",
    codexApprovedSimulatedRun: "Codex 已验收划手证据，并接受本轮协作。",
    codexDispatchingWorker: "Codex 主 Agent 正在调度 Claude Code QA/Ops 划手。",
    codexReadSteererSkill: "Codex 在调度队伍前已读取 docs/skills/dragonboat-steerer.md。",
    codexSplitTasks: "Codex 已把任务拆分给前端、后端和 QA/Ops 三个划手。",
    finalAccepted: "全栈协作应用已通过主 Agent 验收",
    frontendIntegratedEvidence: "看板 UI 已按 API 契约完成联调",
    frontendReadied: "前端划手已接好注册登录页面、看板外壳和拖拽状态，并开始核对后端排序协议。",
    frontendToBackendQuestion:
      "Diff 交接 handoffs/agent_frontend_to_agent_backend_question.diff：关于卡片排序，跨列表移动是否应调用 POST /api/cards/reorder，并携带 sourceListId、targetListId 和有序卡片 id？",
    frontendToQaEvidence:
      "Diff 交接 handoffs/agent_frontend_to_agent_qa_ops_ui.diff：前端证据：注册/登录流程可渲染，看板从 API 加载，列表和卡片支持按上方后端契约完成 drag-and-drop 拖拽排序。",
    fullstackTestsPassed: "全栈认证与拖拽排序测试已通过",
    qaReadied:
      "QA/Ops 划手已读取 handoffs/agent_frontend_to_agent_qa_ops_ui.diff，并完成认证、看板加载、列表排序、卡片排序和 API 错误处理的集成检查。",
    qaRequest: "QA/Ops 请求：请提供拖拽路径和持久化验收点，方便自动化测试在刷新后验证卡片顺序。",
    qaChecks: "QA/Ops 检查已通过",
    qaVerifiedHandoff: "QA/Ops 划手已验证交接路径与证据队列。",
    rowerSkillAttached: "Codex 已把 docs/skills/dragonboat-rower.md 附加到后端、前端和 QA/Ops 的任务包。",
    seedHandoff: "请准备第一份给前端划手的接口契约交接。",
    simulatedBackendContract: "GET /api/run 返回 crew、tasks、mailbox 和 evidence 数组。",
    simulatedBackendPublished: "后端划手已发布给前端使用的 /api/run 契约。",
    simulatedFrontendRendered: "前端划手已根据 API 契约渲染 command deck 状态。",
    steererReviewAccepted: "主 Agent 验收通过",
    taskBackend:
      "任务包：实现认证、看板、列表、卡片与排序 API。读取 docs/skills/dragonboat-rower.md，并在接口可用后立刻把 API 契约发给前端。",
    taskFrontend:
      "任务包：实现登录/注册、看板 UI、列表与卡片拖拽排序。读取 docs/skills/dragonboat-rower.md，不确定 API 形状时先问后端，不要猜。",
    yesReorder:
      "确认。卡片排序请发送 {sourceListId,targetListId,orderedCardIds}；同列表移动可以让 sourceListId 与 targetListId 相同。错误返回 {error}。",
    workerCompleted: "Claude 划手已完成",
    workerFailed: "Claude 划手执行失败"
  }
} satisfies Record<DemoLanguage, Record<string, string>>;

export interface ClaudeWorkerTask {
  name: string;
  prompt: string;
}

export function createDefaultClaudeWorkerTask(language: DemoLanguage = "zh"): ClaudeWorkerTask {
  return {
    name: "dragonboat-qa-ops",
    prompt: language === "en" ? EN_REAL_WORKER_PROMPT : REAL_WORKER_PROMPT
  };
}

export const DEFAULT_CLAUDE_WORKER_TASK: ClaudeWorkerTask = createDefaultClaudeWorkerTask("zh");

interface DemoEngineOptions {
  clock?: () => string;
  eventRecordPath?: string | null;
  runId?: string;
}

export function defaultEventRecordPath(cwd = process.cwd(), runId = DEFAULT_RUN_ID) {
  return join(cwd, ".dragonboat", "runs", runId, "events.json");
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function asLanguage(value: unknown): DemoLanguage {
  return value === "en" ? "en" : "zh";
}

function asPlatform(value: unknown): AgentPlatform {
  return value === "codex_cli" ? "codex_cli" : "claude_code_cli";
}

function titleCaseRole(role: string) {
  return role
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function defaultMemberName(agentId: string, role: string, platform: AgentPlatform) {
  if (role === "steerer" || platform === "codex_cli") {
    return "Codex Steerer";
  }

  return `${titleCaseRole(role || agentId.replace(/^agent_/, ""))} Rower`;
}

function formatAttachmentList(attachments: HumanLoopAttachment[], language: DemoLanguage) {
  if (attachments.length === 0) {
    return "";
  }

  const names = attachments.map((attachment) => attachment.name).join(", ");
  return language === "zh" ? ` 附件：${names}` : ` Attachments: ${names}`;
}

function compactInstruction(body: string) {
  return body.length > 84 ? `${body.slice(0, 84)}...` : body;
}

function formatAdvisorBody(kind: AdvisorMessageKind, body: string, source?: string) {
  return [`Advisor ${kind}: ${body}`, source ? `Source: ${source}` : ""].filter(Boolean).join("\n");
}

function inferHumanLoopTarget(body: string, attachments: HumanLoopAttachment[]) {
  const normalized = body.toLowerCase();
  const hasImage = attachments.some((attachment) => attachment.type.startsWith("image/"));

  if (
    hasImage ||
    /前端|页面|视觉|样式|排版|按钮|图片|image|ui|frontend|css|layout|component/.test(normalized)
  ) {
    return {
      agentId: "agent_frontend",
      taskId: "task_frontend",
      label: "Frontend Rower"
    };
  }

  if (/后端|接口|数据库|api|server|backend|schema|auth/.test(normalized)) {
    return {
      agentId: "agent_backend",
      taskId: "task_backend",
      label: "Backend Rower"
    };
  }

  if (/测试|验证|部署|运维|回归|qa|ops|test|ci|deploy/.test(normalized)) {
    return {
      agentId: "agent_qa_ops",
      taskId: "task_qa_ops",
      label: "QA/Ops Rower"
    };
  }

  return {
    agentId: "agent_frontend",
    taskId: "task_frontend",
    label: "Frontend Rower"
  };
}

function humanLoopCopy(language: DemoLanguage, body: string, attachments: HumanLoopAttachment[], targetLabel: string) {
  const instruction = compactInstruction(body);
  const files = formatAttachmentList(attachments, language);

  if (language === "en") {
    return {
      humanToSteerer: `Human loop request: ${body}${files}`,
      steererReceived: `Codex received a human-in-the-loop adjustment and is planning a new dispatch.${files}`,
      steererDispatch: `Codex routed the latest instruction to ${targetLabel}: ${instruction}`,
      rowerAck: `Received latest adjustment: ${instruction}${files}`
    };
  }

  return {
    humanToSteerer: `人类新一轮指令：${body}${files}`,
    steererReceived: `Codex 已收到 human-in-the-loop 调整，正在规划新一轮调度。${files}`,
    steererDispatch: `Codex 已将最新调整下达给 ${targetLabel}：${instruction}`,
    rowerAck: `收到最新调整：${instruction}${files}`
  };
}

function updateTask(run: DemoRun, taskId: string, status: TaskStatus, progress: number): DemoRun {
  if (!run.tasks.some((task) => task.id === taskId)) {
    return {
      ...run,
      tasks: [
        ...run.tasks,
        {
          id: taskId,
          lane: "Dynamic",
          owner: "",
          progress,
          status,
          title: taskId
        }
      ]
    };
  }

  return {
    ...run,
    tasks: run.tasks.map((task) => (task.id === taskId ? { ...task, status, progress } : task))
  };
}

function upsertTask(
  run: DemoRun,
  task: {
    id: string;
    lane: string;
    owner: string;
    progress: number;
    status: TaskStatus;
    title: string;
  }
): DemoRun {
  if (!run.tasks.some((item) => item.id === task.id)) {
    return {
      ...run,
      tasks: [...run.tasks, task]
    };
  }

  return {
    ...run,
    tasks: run.tasks.map((item) => (item.id === task.id ? { ...item, ...task } : item))
  };
}

function upsertCrewMember(run: DemoRun, member: CrewMember): DemoRun {
  if (member.role === "steerer" || member.platform === "codex_cli") {
    return {
      ...run,
      crew: {
        ...run.crew,
        steerer: {
          ...run.crew.steerer,
          ...member
        }
      }
    };
  }

  const existing = run.crew.rowers.some((rower) => rower.id === member.id);

  return {
    ...run,
    crew: {
      ...run.crew,
      rowers: existing
        ? run.crew.rowers.map((rower) => (rower.id === member.id ? { ...rower, ...member } : rower))
        : [...run.crew.rowers, member]
    }
  };
}

function updateCrewStatus(run: DemoRun, agentId: string, status: AgentStatus): DemoRun {
  const updateMember = (member: DemoRun["crew"]["steerer"]) =>
    member.id === agentId ? { ...member, status } : member;
  let nextRun: DemoRun = {
    ...run,
    crew: {
      steerer: updateMember(run.crew.steerer),
      rowers: run.crew.rowers.map(updateMember)
    }
  };

  if (agentId !== "agent_codex") {
    for (const task of nextRun.tasks.filter((item) => item.owner === agentId)) {
      if (status === "blocked") {
        nextRun = updateTask(nextRun, task.id, "blocked", task.progress);
      } else if (status === "done" && !["evidence_submitted", "reviewed", "stopped", "verified"].includes(task.status)) {
        nextRun = updateTask(nextRun, task.id, "done", Math.max(task.progress, 90));
      } else if (status === "stopped") {
        nextRun = updateTask(nextRun, task.id, "stopped", task.progress);
      }
    }
  }

  return nextRun;
}

function deriveRun(events: DemoEvent[], runId = DEFAULT_RUN_ID): DemoRun {
  let run = {
    ...createInitialDemoRun(asLanguage(events.find((event) => event.type === "run.created")?.payload?.language)),
    runId
  };

  for (const event of events) {
    if (event.type === "run.created") {
      run = { ...run, language: asLanguage(event.payload?.language), phase: "ready" };
    }

    if (event.type === "crew.member.status_changed") {
      const agentId = asString(event.payload?.agentId);
      const status = asString(event.payload?.status) as AgentStatus;
      run = updateCrewStatus(run, agentId, status);
    }

    if (event.type === "crew.member.registered") {
      const agentId = asString(event.payload?.agentId) || event.actor;
      const role = (asString(event.payload?.role) || "worker") as AgentRole;
      const platform = asPlatform(event.payload?.platform);
      run = upsertCrewMember(run, {
        id: agentId,
        name: asString(event.payload?.name) || defaultMemberName(agentId, role, platform),
        platform,
        role,
        status: (asString(event.payload?.status) as AgentStatus) || (role === "steerer" ? "steering" : "ready")
      });
    }

    if (event.type === "task.packet.created") {
      const taskId = (event.taskId ?? asString(event.payload?.taskId)) || event.id.replace("evt_", "task_");
      run = upsertTask(run, {
        id: taskId,
        lane: asString(event.payload?.lane) || titleCaseRole(asString(event.payload?.role) || "Dynamic"),
        owner: asString(event.payload?.owner),
        progress: asNumber(event.payload?.progress, 0),
        status: (asString(event.payload?.status) as TaskStatus) || "ready",
        title: asString(event.payload?.title) || taskId
      });
    }

    if (event.type === "task.status_changed") {
      const status = asString(event.payload?.status) as TaskStatus;
      const progress = asNumber(event.payload?.progress, 0);
      run = updateTask(run, event.taskId ?? "", status, progress);
    }

    if (event.type === "mailbox.message.sent") {
      run = {
        ...run,
        mailbox: [
          ...run.mailbox,
          {
            id: event.messageId ?? event.id.replace("evt_", "msg_"),
            from: asString(event.payload?.from),
            to: asString(event.payload?.to),
            taskId: event.taskId ?? asString(event.payload?.taskId),
            type: (asString(event.payload?.messageType) || asString(event.payload?.type)) as MailboxMessage["type"],
            body: asString(event.payload?.body),
            createdAt: event.createdAt
          }
        ]
      };
    }

    if (event.type === "command.started") {
      const command = asString(event.payload?.command);
      const args = Array.isArray(event.payload?.args)
        ? event.payload.args.filter((item): item is string => typeof item === "string")
        : [];
      const log: AgentLog = {
        id: event.id.replace("evt_", "log_"),
        agentId: asString(event.payload?.agentId) || event.actor,
        line: `$ ${[command, ...args].filter(Boolean).join(" ")}`.trim(),
        createdAt: event.createdAt
      };
      run = { ...run, agentLogs: [...run.agentLogs, log], phase: run.phase === "reviewed" ? "reviewed" : "running" };
    }

    if (event.type === "command.output") {
      const log: AgentLog = {
        id: event.id.replace("evt_", "log_"),
        agentId: asString(event.payload?.agentId),
        line: asString(event.payload?.line),
        createdAt: event.createdAt
      };
      run = { ...run, agentLogs: [...run.agentLogs, log], phase: "running" };
    }

    if (event.type === "command.finished") {
      const exitCode = event.payload?.exitCode;
      const signal = event.payload?.signal;
      const log: AgentLog = {
        id: event.id.replace("evt_", "log_"),
        agentId: asString(event.payload?.agentId) || event.actor,
        line: `command finished exitCode=${typeof exitCode === "number" ? exitCode : "unknown"}${
          typeof signal === "string" ? ` signal=${signal}` : ""
        }`,
        createdAt: event.createdAt
      };
      run = { ...run, agentLogs: [...run.agentLogs, log], phase: run.phase === "reviewed" ? "reviewed" : "running" };
    }

    if (event.type === "evidence.submitted") {
      const taskId = event.taskId ?? asString(event.payload?.taskId);
      const item: EvidenceItem = {
        id: event.id.replace("evt_", "evidence_"),
        taskId,
        title: asString(event.payload?.title),
        status: asString(event.payload?.status) as EvidenceItem["status"],
        createdAt: event.createdAt
      };
      run = { ...run, evidence: [...run.evidence, item] };

      if (taskId) {
        const existingTask = run.tasks.find((task) => task.id === taskId);
        const preservedTerminalStatuses: TaskStatus[] = ["reviewed", "stopped", "verified"];
        const status = existingTask && preservedTerminalStatuses.includes(existingTask.status)
          ? existingTask.status
          : "evidence_submitted";
        run = updateTask(run, taskId, status, Math.max(existingTask?.progress ?? 0, 90));
      }
    }

    if (event.type === "steerer.review.completed") {
      const item: EvidenceItem = {
        id: event.id.replace("evt_", "evidence_"),
        taskId: asString(event.payload?.taskId) || "task_qa_ops",
        title: asString(event.payload?.title),
        status: asString(event.payload?.status) as EvidenceItem["status"],
        createdAt: event.createdAt
      };
      run = {
        ...run,
        phase: "reviewed",
        crew: {
          steerer: { ...run.crew.steerer, status: "done" },
          rowers: run.crew.rowers.map((rower) => ({ ...rower, status: "done" }))
        },
        tasks: run.tasks.map((task) => ({ ...task, status: "verified", progress: 100 })),
        evidence: [...run.evidence, item]
      };
    }
  }

  return { ...run, events };
}

export class DemoEngine {
  private events: DemoEvent[] = [];
  private language: DemoLanguage = "zh";
  private readonly clock: () => string;
  private readonly eventRecordPath: string | null;
  private readonly runId: string;
  private subscribers = new Set<EventSubscriber>();

  constructor(options: DemoEngineOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.eventRecordPath = options.eventRecordPath ?? null;
    this.runId = options.runId ?? DEFAULT_RUN_ID;

    if (!this.restorePersistedEvents()) {
      this.resetToSeed("zh");
    }
  }

  snapshot(): DemoRun {
    this.reconcilePersistedEvents();
    return structuredClone(deriveRun(this.events, this.runId));
  }

  listEvents(): DemoEvent[] {
    this.reconcilePersistedEvents();
    return structuredClone(this.events);
  }

  reconcilePersistedEvents(options: { broadcast?: boolean } = {}) {
    const persisted = this.readPersistedEvents();
    if (!persisted || persisted.length === 0) {
      return [];
    }

    const existingIds = new Set(this.events.map((event) => event.id));
    const byId = new Map(this.events.map((event) => [event.id, event] as const));
    const externalEvents = persisted.filter((event) => !existingIds.has(event.id));

    if (externalEvents.length === 0) {
      return [];
    }

    for (const event of externalEvents) {
      byId.set(event.id, event);
    }

    this.events = Array.from(byId.values()).sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id));

    if (options.broadcast) {
      for (const event of externalEvents.sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id))) {
        for (const subscriber of this.subscribers) {
          subscriber(event);
        }
      }
    }

    return externalEvents;
  }

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  sendMessage(input: SendMessageInput): DemoRun {
    this.appendMailbox(input);
    this.appendTaskStatus("task_backend", "agent_backend", "handoff_sent", 65);
    this.appendTaskStatus("task_frontend", "agent_frontend", "contract_received", 50);
    this.append({
      type: "evidence.submitted",
      actor: "agent_qa_ops",
      taskId: "task_qa_ops",
      payload: {
        title: text[this.language].backendContractRecorded,
        status: "passed"
      }
    });

    return this.snapshot();
  }

  sendHumanLoop(input: SendHumanLoopInput): DemoRun {
    const language = input.language ?? this.language;
    const attachments = input.attachments ?? [];
    const target = inferHumanLoopTarget(input.body, attachments);
    const copy = humanLoopCopy(language, input.body, attachments, target.label);
    const targetRole = target.agentId.replace(/^agent_/, "") as AgentRole;

    this.language = language;
    this.registerCrewMember({
      agentId: target.agentId,
      name: target.label,
      platform: "claude_code_cli",
      role: targetRole,
      status: "ready"
    });
    this.appendTaskPacket({
      owner: target.agentId,
      role: targetRole,
      taskId: target.taskId,
      title: target.label
    });
    this.append({
      type: "human.input.submitted",
      actor: "human",
      taskId: target.taskId,
      payload: {
        body: input.body,
        attachments,
        targetAgentId: target.agentId
      }
    });
    this.appendMailbox({
      from: "human",
      to: "agent_codex",
      taskId: target.taskId,
      type: "instruction",
      body: copy.humanToSteerer
    });
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        status: "planning"
      }
    });
    this.appendCommand("agent_codex", copy.steererReceived);
    this.appendCommand("agent_codex", copy.steererDispatch);
    this.appendMailbox({
      from: "agent_codex",
      to: target.agentId,
      taskId: target.taskId,
      type: "instruction",
      body: copy.steererDispatch
    });
    this.append({
      type: "crew.member.status_changed",
      actor: target.agentId,
      payload: {
        agentId: target.agentId,
        status: "running"
      }
    });
    this.appendTaskStatus(target.taskId, target.agentId, "running", 88);
    this.appendCommand(target.agentId, copy.rowerAck);

    return this.snapshot();
  }

  recordHumanLoopForSteerer(input: SendHumanLoopInput): DemoRun {
    const language = input.language ?? this.language;
    const attachments = input.attachments ?? [];
    const target = inferHumanLoopTarget(input.body, attachments);
    const copy = humanLoopCopy(language, input.body, attachments, target.label);

    this.language = language;
    this.append({
      type: "human.input.submitted",
      actor: "human",
      taskId: target.taskId,
      payload: {
        body: input.body,
        attachments,
        targetAgentId: "agent_codex"
      }
    });
    this.appendMailbox({
      from: "human",
      to: "agent_codex",
      taskId: target.taskId,
      type: "instruction",
      body: copy.humanToSteerer
    });
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        status: "planning"
      }
    });

    return this.snapshot();
  }

  runFullstackCase(language: DemoLanguage = this.language, options: { reset?: boolean } = {}): DemoRun {
    if (options.reset ?? true) {
      this.resetToSeed(language);
    } else {
      this.language = language;
    }
    const t = text[this.language];

    this.appendFullstackCrew();
    this.appendCommand("agent_codex", t.codexReadSteererSkill);
    this.appendCommand("agent_codex", t.acceptedFullstackTarget);
    this.appendCommand("agent_codex", t.rowerSkillAttached);
    this.appendTaskStatus("task_backend", "agent_backend", "running", 45);
    this.appendTaskStatus("task_frontend", "agent_frontend", "running", 42);
    this.appendTaskStatus("task_qa_ops", "agent_qa_ops", "watching", 48);
    this.appendMailbox({
      from: "agent_codex",
      to: "agent_backend",
      taskId: "task_backend",
      type: "status",
      body: t.taskBackend
    });
    this.appendMailbox({
      from: "agent_codex",
      to: "agent_frontend",
      taskId: "task_frontend",
      type: "status",
      body: t.taskFrontend
    });
    this.appendCommand("agent_backend", t.backendReadSkill);
    this.appendMailbox({
      from: "agent_backend",
      to: "agent_frontend",
      taskId: "task_backend",
      type: "contract",
      body: t.backendToFrontendContract
    });
    this.appendTaskStatus("task_backend", "agent_backend", "handoff_sent", 72);
    this.appendCommand("agent_frontend", t.frontendReadied);
    this.appendMailbox({
      from: "agent_frontend",
      to: "agent_backend",
      taskId: "task_frontend",
      type: "question",
      body: t.frontendToBackendQuestion
    });
    this.appendMailbox({
      from: "agent_backend",
      to: "agent_frontend",
      taskId: "task_backend",
      type: "contract",
      body: t.yesReorder
    });
    this.appendTaskStatus("task_frontend", "agent_frontend", "handoff_sent", 78);
    this.appendMailbox({
      from: "agent_frontend",
      to: "agent_qa_ops",
      taskId: "task_frontend",
      type: "evidence",
      body: t.frontendToQaEvidence
    });
    this.appendMailbox({
      from: "agent_qa_ops",
      to: "agent_frontend",
      taskId: "task_qa_ops",
      type: "evidence",
      body: t.qaRequest
    });
    this.appendCommand("agent_qa_ops", t.qaReadied);
    this.appendTaskStatus("task_qa_ops", "agent_qa_ops", "evidence_submitted", 92);
    this.append({
      type: "evidence.submitted",
      actor: "agent_backend",
      taskId: "task_backend",
      payload: {
        title: t.apiContractEvidence,
        status: "passed"
      }
    });
    this.append({
      type: "evidence.submitted",
      actor: "agent_frontend",
      taskId: "task_frontend",
      payload: {
        title: t.frontendIntegratedEvidence,
        status: "passed"
      }
    });
    this.append({
      type: "evidence.submitted",
      actor: "agent_qa_ops",
      taskId: "task_qa_ops",
      payload: {
        title: t.fullstackTestsPassed,
        status: "passed"
      }
    });
    this.appendCommand("agent_codex", t.acceptedRun);
    this.append({
      type: "steerer.review.completed",
      actor: "agent_codex",
      payload: {
        taskId: "task_qa_ops",
        title: t.finalAccepted,
        status: "passed"
      }
    });

    return this.snapshot();
  }

  runSimulatedCrew(language: DemoLanguage = this.language): DemoRun {
    this.resetToSeed(language);
    const t = text[this.language];

    this.appendFullstackCrew();
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        status: "planning"
      }
    });
    this.appendCommand("agent_codex", "$ codex exec --profile steerer \"split demo web loop\"");
    this.appendCommand("agent_codex", t.codexSplitTasks);
    this.appendTaskStatus("task_backend", "agent_backend", "running", 55);
    this.appendCommand("agent_backend", "$ claude --agent backend --run \"publish /api/run contract\"");
    this.appendCommand("agent_backend", t.simulatedBackendPublished);
    this.sendMessage({
      from: "agent_backend",
      to: "agent_frontend",
      taskId: "task_backend",
      type: "contract",
      body: t.simulatedBackendContract
    });
    this.appendTaskStatus("task_frontend", "agent_frontend", "running", 70);
    this.appendCommand("agent_frontend", "$ claude --agent frontend --run \"render command deck from /api/run\"");
    this.appendCommand("agent_frontend", t.simulatedFrontendRendered);
    this.appendTaskStatus("task_qa_ops", "agent_qa_ops", "running", 82);
    this.appendCommand("agent_qa_ops", "$ claude --agent qa_ops --run \"npm run demo:test && npm run demo:build\"");
    this.appendCommand("agent_qa_ops", t.qaVerifiedHandoff);
    this.appendCommand("agent_qa_ops", "demo:test passed; demo:build completed");
    this.append({
      type: "evidence.submitted",
      actor: "agent_qa_ops",
      taskId: "task_qa_ops",
      payload: {
        title: t.qaChecks,
        status: "passed"
      }
    });
    this.appendCommand("agent_codex", t.codexApprovedSimulatedRun);
    this.append({
      type: "steerer.review.completed",
      actor: "agent_codex",
      payload: {
        taskId: "task_qa_ops",
        title: t.steererReviewAccepted,
        status: "passed"
      }
    });

    return this.snapshot();
  }

  async runClaudeWorker(
    workerRunner: WorkerCommandRunner,
    cwd: string,
    task: ClaudeWorkerTask = DEFAULT_CLAUDE_WORKER_TASK,
    language: DemoLanguage = this.language
  ): Promise<DemoRun> {
    this.resetToSeed(language);
    const t = text[this.language];

    this.appendFullstackCrew();
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        status: "planning"
      }
    });
    this.appendCommand("agent_codex", t.codexDispatchingWorker);
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_qa_ops",
      payload: {
        agentId: "agent_qa_ops",
        status: "running"
      }
    });
    this.appendTaskStatus("task_qa_ops", "agent_qa_ops", "running", 65);
    this.appendCommand("agent_qa_ops", `$ claude --print --output-format text --name ${task.name}`);

    const result = await workerRunner(
      {
        agentId: "agent_qa_ops",
        taskId: "task_qa_ops",
        name: task.name,
        prompt: task.prompt,
        cwd
      },
      (chunk) => {
        this.appendCommand("agent_qa_ops", `[${chunk.stream}] ${chunk.line}`);
      }
    );
    const passed = result.exitCode === 0;

    this.appendTaskStatus("task_qa_ops", "agent_qa_ops", "evidence_submitted", passed ? 90 : 75);
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        status: "reviewing"
      }
    });
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_qa_ops",
      payload: {
        agentId: "agent_qa_ops",
        status: passed ? "done" : "blocked"
      }
    });
    this.append({
      type: "evidence.submitted",
      actor: "agent_qa_ops",
      taskId: "task_qa_ops",
      payload: {
        title: passed ? t.workerCompleted : t.workerFailed,
        status: passed ? "passed" : "failed",
        exitCode: result.exitCode,
        signal: result.signal
      }
    });

    return this.snapshot();
  }

  appendCommandStarted(agentId: string, command: string, args: string[], cwd?: string) {
    return this.append({
      type: "command.started",
      actor: agentId,
      payload: {
        agentId,
        command,
        args,
        cwd
      }
    });
  }

  appendCommandOutput(agentId: string, line: string) {
    return this.appendCommand(agentId, line);
  }

  appendCommandFinished(agentId: string, exitCode: number | null, signal?: string | null) {
    return this.append({
      type: "command.finished",
      actor: agentId,
      payload: {
        agentId,
        exitCode,
        signal
      }
    });
  }

  appendCrewStatus(agentId: string, status: AgentStatus) {
    return this.append({
      type: "crew.member.status_changed",
      actor: agentId,
      payload: {
        agentId,
        status
      }
    });
  }

  appendCrewWaveStarted(input: {
    activeAgentIds: string[];
    archivedAgentIds?: string[];
    reason?: string;
    waveId: string;
  }) {
    return this.append({
      type: "crew.wave.started",
      actor: "agent_codex",
      payload: {
        activeAgentIds: input.activeAgentIds,
        archivedAgentIds: input.archivedAgentIds ?? [],
        reason: input.reason,
        waveId: input.waveId
      }
    });
  }

  appendCrewMemberArchived(agentId: string, input: { reason?: string; source?: string; waveId?: string } = {}) {
    return this.append({
      type: "crew.member.archived",
      actor: "agent_codex",
      payload: {
        agentId,
        reason: input.reason ?? "manual_archive",
        source: input.source,
        waveId: input.waveId
      }
    });
  }

  appendMailboxMessage(input: SendMessageInput) {
    this.appendMailbox(input);
    return this.snapshot();
  }

  appendStructuredHandoff(input: StructuredHandoffInput) {
    const handoffId = input.handoffId ?? createHandoffId(input);
    const body = [
      `Structured handoff ${handoffId}: ${input.summary}`,
      `Claims: ${input.claims.join("; ")}`,
      `Sources: ${input.sources.join("; ")}`,
      `Open questions: ${input.openQuestions.join("; ")}`,
      `Required action: ${input.requiredAction}`,
      input.artifactPath ? `Artifact: ${input.artifactPath}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    this.append({
      type: "handoff.submitted",
      actor: input.from,
      taskId: input.taskId,
      payload: {
        ackRequired: input.ackRequired,
        ack_required: input.ackRequired,
        artifactPath: input.artifactPath,
        artifact_path: input.artifactPath,
        body: input.body,
        claims: input.claims,
        confidence: input.confidence,
        from: input.from,
        handoffId,
        openQuestions: input.openQuestions,
        open_questions: input.openQuestions,
        recipient: input.recipient,
        requiredAction: input.requiredAction,
        required_action: input.requiredAction,
        sources: input.sources,
        summary: input.summary,
        taskId: input.taskId,
        to: input.recipient
      }
    });
    this.appendMailbox({
      body,
      from: input.from,
      taskId: input.taskId,
      to: input.recipient,
      type: "contract"
    });

    return this.snapshot();
  }

  appendHandoffAck(input: HandoffAckInput) {
    this.append({
      type: "handoff.acknowledged",
      actor: input.ackBy,
      taskId: input.taskId,
      payload: {
        ackBy: input.ackBy,
        handoffId: input.handoffId,
        note: input.note,
        status: input.status,
        taskId: input.taskId
      }
    });

    return this.snapshot();
  }

  completeTask(input: {
    actor: string;
    commandsRun?: string[];
    evidencePath: string;
    handoffPath: string;
    remainingRisks?: string[];
    status?: EvidenceItem["status"];
    summary: string;
    taskId: string;
    taskType?: EvidenceTaskType;
    touchedFiles?: string[];
    workspaceProof?: string;
  }) {
    this.submitEvidence({
      actor: input.actor,
      commandsRun: input.commandsRun,
      files: [input.evidencePath],
      remainingRisks: input.remainingRisks,
      status: input.status ?? "passed",
      summary: input.summary,
      taskId: input.taskId,
      taskType: input.taskType,
      touchedFiles: input.touchedFiles,
      workspaceProof: input.workspaceProof
    });
    const report = evaluateEvidenceGate({
      agentId: input.actor,
      events: this.events,
      taskId: input.taskId,
      taskType: input.taskType ?? "general"
    });

    this.append({
      type: "evidence.gate.checked",
      actor: "agent_codex",
      taskId: input.taskId,
      payload: {
        agentId: input.actor,
        checks: report.checks,
        evidenceSeq: report.evidenceSeq,
        status: report.status,
        taskType: report.taskType
      }
    });
    this.appendTaskStatus(input.taskId, input.actor, "done", 100);
    this.appendCrewStatus(input.actor, "done");
    this.append({
      type: "task.completed",
      actor: input.actor,
      taskId: input.taskId,
      payload: {
        evidencePath: input.evidencePath,
        gateStatus: report.status,
        handoffPath: input.handoffPath,
        summary: input.summary,
        taskId: input.taskId
      }
    });

    return this.snapshot();
  }

  appendAdvisorMessage(input: SendAdvisorInput) {
    const body = formatAdvisorBody(input.kind, input.body, input.source);

    this.append({
      type: "advisor.message.sent",
      actor: "advisor",
      taskId: "task_advisor",
      payload: {
        body: input.body,
        kind: input.kind,
        source: input.source,
        to: "agent_codex"
      }
    });
    this.appendMailbox({
      body,
      from: "advisor",
      taskId: "task_advisor",
      to: "agent_codex",
      type: input.kind
    });

    return this.snapshot();
  }

  appendAgentConfigUpdated(agentId: string, input: Record<string, unknown>) {
    this.append({
      type: "agent.config.updated",
      actor: agentId,
      payload: {
        agentId,
        ...input
      }
    });

    return this.snapshot();
  }

  appendRouteDecision(input: {
    agentId: string;
    effort?: string;
    fallback?: string;
    model?: string;
    reason?: string;
    requiredCapabilities?: string[];
    role: string;
    source: string;
    taskId: string;
  }) {
    this.append({
      type: "route.decision.recorded",
      actor: "agent_codex",
      taskId: input.taskId,
      payload: {
        agentId: input.agentId,
        effort: input.effort,
        fallback: input.fallback,
        model: input.model,
        reason: input.reason,
        requiredCapabilities: input.requiredCapabilities ?? [],
        role: input.role,
        source: input.source
      }
    });

    return this.snapshot();
  }

  registerCrewMember(input: {
    agentId: string;
    name?: string;
    platform: AgentPlatform;
    role: AgentRole;
    status?: AgentStatus;
  }) {
    this.append({
      type: "crew.member.registered",
      actor: input.agentId,
      payload: {
        agentId: input.agentId,
        name: input.name ?? defaultMemberName(input.agentId, input.role, input.platform),
        platform: input.platform,
        role: input.role,
        status: input.status ?? (input.role === "steerer" ? "steering" : "ready")
      }
    });

    return this.snapshot();
  }

  registerSteerer(input: { pid?: number; projectName?: string; workspaceRoot?: string }) {
    this.registerCrewMember({
      agentId: "agent_codex",
      name: "Codex Steerer",
      platform: "codex_cli",
      role: "steerer",
      status: "steering"
    });
    this.appendCommand("agent_codex", `DragonBoat registered foreground Codex steerer for ${input.projectName ?? "project"}.`);
    this.append({
      type: "crew.member.status_changed",
      actor: "agent_codex",
      payload: {
        agentId: "agent_codex",
        pid: input.pid,
        status: "steering",
        workspaceRoot: input.workspaceRoot
      }
    });

    return this.snapshot();
  }

  appendTaskPacket(input: {
    owner: string;
    role?: string;
    status?: TaskStatus;
    taskId: string;
    title: string;
  }) {
    this.append({
      type: "task.packet.created",
      actor: "agent_codex",
      taskId: input.taskId,
      payload: {
        lane: titleCaseRole(input.role ?? input.owner.replace(/^agent_/, "")),
        owner: input.owner,
        progress: input.status === "running" ? 15 : 0,
        role: input.role,
        status: input.status ?? "ready",
        title: input.title
      }
    });

    return this.snapshot();
  }

  appendTaskStatusChange(taskId: string, actor: string, status: TaskStatus, progress: number) {
    this.appendTaskStatus(taskId, actor, status, progress);
    return this.snapshot();
  }

  submitEvidence(input: {
    actor: string;
    commandsRun?: string[];
    files?: string[];
    remainingRisks?: string[];
    screenshots?: string[];
    sources?: string[];
    status?: EvidenceItem["status"];
    summary: string;
    taskId: string;
    taskType?: string;
    touchedFiles?: string[];
    workspaceProof?: string;
  }) {
    this.append({
      type: "evidence.submitted",
      actor: input.actor,
      taskId: input.taskId,
      payload: {
        commandsRun: input.commandsRun ?? [],
        files: input.files ?? [],
        remainingRisks: input.remainingRisks ?? [],
        screenshots: input.screenshots ?? [],
        sources: input.sources ?? [],
        status: input.status ?? "passed",
        summary: input.summary,
        taskType: input.taskType,
        title: input.summary,
        touchedFiles: input.touchedFiles ?? [],
        workspaceProof: input.workspaceProof
      }
    });

    return this.snapshot();
  }

  private resetToSeed(language: DemoLanguage) {
    this.language = language;
    this.events = [];
    this.appendSeedEvents();
  }

  private appendSeedEvents() {
    this.append({
      type: "run.created",
      actor: "agent_system",
      createdAt: SEED_DATE,
      payload: {
        language: this.language,
        title: this.language === "zh" ? "DragonBoat 本地协作演示" : "DragonBoat demo web loop"
      }
    });
  }

  private appendFullstackCrew() {
    const members = [
      {
        agentId: "agent_frontend",
        name: "Frontend Rower",
        role: "frontend",
        status: "ready"
      },
      {
        agentId: "agent_backend",
        name: "Backend Rower",
        role: "backend",
        status: "ready"
      },
      {
        agentId: "agent_qa_ops",
        name: "QA/Ops Rower",
        role: "qa_ops",
        status: "watching"
      }
    ] as const;
    const tasks = [
      {
        owner: "agent_frontend",
        role: "frontend",
        status: "ready",
        taskId: "task_frontend",
        title: "Render command deck handoff"
      },
      {
        owner: "agent_backend",
        role: "backend",
        status: "ready",
        taskId: "task_backend",
        title: "Publish API contract"
      },
      {
        owner: "agent_qa_ops",
        role: "qa_ops",
        status: "watching",
        taskId: "task_qa_ops",
        title: "Verify demo run"
      }
    ] as const;

    for (const member of members) {
      this.registerCrewMember({
        agentId: member.agentId,
        name: member.name,
        platform: "claude_code_cli",
        role: member.role,
        status: member.status
      });
    }

    for (const task of tasks) {
      this.appendTaskPacket(task);
    }

    if (!this.events.some((event) => event.messageId === "msg_seed")) {
      this.append({
        type: "mailbox.message.sent",
        actor: "agent_codex",
        createdAt: SEED_DATE,
        taskId: "task_backend",
        messageId: "msg_seed",
        payload: {
          from: "agent_codex",
          to: "agent_backend",
          taskId: "task_backend",
          messageType: "status",
          body: text[this.language].seedHandoff
        }
      });
    }
  }

  private appendTaskStatus(taskId: string, actor: string, status: TaskStatus, progress: number) {
    this.append({
      type: "task.status_changed",
      actor,
      taskId,
      payload: {
        status,
        progress
      }
    });
  }

  private appendMailbox(input: SendMessageInput) {
    const messageId = `msg_${this.events.length + 1}`;
    this.append({
      type: "mailbox.message.sent",
      actor: input.from,
      taskId: input.taskId,
      messageId,
      payload: {
        from: input.from,
        to: input.to,
        taskId: input.taskId,
        messageType: input.type,
        body: input.body
      }
    });
  }

  private appendCommand(agentId: string, line: string) {
    this.append({
      type: "command.output",
      actor: agentId,
      payload: {
        agentId,
        line
      }
    });
  }

  private append(input: AppendEventInput): DemoEvent {
    this.reconcilePersistedEvents();
    const seq = this.events.length + 1;
    const event: DemoEvent = {
      id: `evt_${String(seq).padStart(4, "0")}`,
      seq,
      runId: this.runId,
      createdAt: input.createdAt ?? this.clock(),
      ...input
    };

    this.events = [...this.events, event];
    this.persistEvents();
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }

    return event;
  }

  private persistEvents() {
    if (!this.eventRecordPath) {
      return;
    }

    const record = {
      version: "dragonboat.demo.events.v1",
      runId: this.runId,
      updatedAt: this.clock(),
      events: this.events
    };

    mkdirSync(dirname(this.eventRecordPath), { recursive: true });
    writeFileSync(this.eventRecordPath, `${JSON.stringify(record, null, 2)}\n`);
  }

  private restorePersistedEvents() {
    const events = this.readPersistedEvents();
    if (!events || events.length === 0) {
      return false;
    }

    this.events = events;
    this.language = asLanguage(this.events.find((event) => event.type === "run.created")?.payload?.language);

    return this.events.length > 0;
  }

  private readPersistedEvents() {
    if (!this.eventRecordPath || !existsSync(this.eventRecordPath)) {
      return null;
    }

    try {
      const record = JSON.parse(readFileSync(this.eventRecordPath, "utf8")) as { events?: DemoEvent[] };
      if (!Array.isArray(record.events) || record.events.length === 0) {
        return null;
      }

      return record.events.filter((event) => event.runId === this.runId);
    } catch {
      return null;
    }
  }
}

export function toSseEvent(event: DemoEvent): string {
  return `event: dragonboat-event\ndata: ${JSON.stringify(event)}\n\n`;
}
