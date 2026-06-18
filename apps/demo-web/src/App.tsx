import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  GitBranch,
  History,
  ListTree,
  Moon,
  Paperclip,
  Play,
  Send,
  SlidersHorizontal,
  ShieldCheck,
  Sun,
  TerminalSquare,
  X
} from "lucide-react";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  httpDemoApiClient,
  type AgentEffort,
  type AgentRuntimeConfigs,
  type CrewAgentId,
  type DemoApiClient,
  type DemoEvent,
  type DemoRun,
  type ReadableProjection,
  type ReplayExportResult,
  type SessionSummary
} from "./client/demoApiClient";
import { summarizeWorkflowEvents, updateClaimLedger, type ClaimLedgerEntry } from "./shared/agenticWorkflow";
import { createCostTrace } from "./shared/costTrace";

interface AppProps {
  api?: DemoApiClient;
}

type Locale = "en" | "zh";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "dragonboat.demo.theme.v1";
const RUN_SNAPSHOT_CACHE_KEY = "dragonboat.demo.lastRunSnapshot.v1";
const CACHED_RUN_RECORD_LIMIT = 120;
const MAX_ROWERS_WITH_EMPTY_PEER_LINKS = 5;
const DEFAULT_CLIENT_API_URL = "http://127.0.0.1:8787";

function clientApiUrl() {
  return (import.meta.env.VITE_DRAGONBOAT_API_URL || DEFAULT_CLIENT_API_URL).replace(/\/$/, "");
}

function initialTheme(): Theme {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function cacheRunSnapshot(run: DemoRun | null) {
  if (!run || typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
    return;
  }

  const snapshot: DemoRun = {
    ...run,
    agentLogs: run.agentLogs.slice(-CACHED_RUN_RECORD_LIMIT),
    events: run.events.slice(-CACHED_RUN_RECORD_LIMIT),
    mailbox: run.mailbox.slice(-CACHED_RUN_RECORD_LIMIT),
    evidence: run.evidence.slice(-CACHED_RUN_RECORD_LIMIT)
  };

  try {
    window.localStorage.setItem(RUN_SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    window.localStorage.removeItem(RUN_SNAPSHOT_CACHE_KEY);
  }
}

function readCachedRunSnapshot() {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return null;
  }

  const raw = window.localStorage.getItem(RUN_SNAPSHOT_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DemoRun;
  } catch {
    return null;
  }
}

const CONTRACT_MESSAGE = {
  en: "GET /api/run returns crew, tasks, mailbox, and evidence arrays.",
  zh: "GET /api/run 返回 crew、tasks、mailbox 和 evidence 数组。"
} satisfies Record<Locale, string>;

const COPY = {
  en: {
    activeMailbox: "Active Mailbox",
    agentLanguage: "Agent messages: English",
    agentConsole: "Agent Console",
    commandDeck: "Visual Supervisor",
    crewNetwork: "Crew Network",
    eventStream: "Event Stream",
    evidenceQueue: "Evidence Queue",
    exportReplay: "Export replay MP4",
    exportReady: "Replay ready",
    attachFiles: "Attach files",
    edgeHistory: "Link messages",
    graphEmpty: "No messages on this link yet.",
    humanLoopCaption: "Human loop to steerer",
    humanLoopPlaceholder: "Tell the steerer what changed. Press Enter to send.",
    humanPromptLayer: "Human Prompt layer",
    runFullstackCase: "Run fullstack case",
    humanInput: "Human input is routed to the steerer first.",
    humanLabel: "Human",
    languageButton: "中文",
    mainAgent: "Main Agent",
    mailboxEmpty: "No active mailbox traffic yet.",
    mailboxSignals: "Peer-to-peer signals",
    monitoring: "Live coordination map",
    modelRouting: "Model Routing",
    modelRoutingHint: "DragonBoat recorded route; sync foreground Codex changes with dragonboat config set.",
    recordContract: "Record backend contract",
    rowers: "rowers",
    runClaudeWorker: "Run Claude worker",
    runRealCliCrew: "Run real CLI crew",
    runSimulatedCrew: "Run simulated crew",
    sessionRail: "DragonBoat sessions",
    noSessionsRailHint: "Start a steerer from your terminal to create a run.",
    cliMirror: "CLI Mirror",
    viewCli: "View CLI",
    terminalEmpty: "No terminal output yet.",
    currentFolder: "Current folder",
    confirmWorkspace: "Track this folder",
    deleteSession: "Delete session",
    parentFolder: "Parent folder",
    steerer: "steerer",
    steererConversation: "Steerer Conversation",
    steererHistory: "Session history",
    steererHistoryEmpty: "No human loop history yet.",
    taskGraph: "Task Graph",
    themeButtonDark: "Dark",
    themeButtonLight: "Light",
    themeDark: "Theme: Dark",
    themeLight: "Theme: Light",
    mailboxTimeline: "Agent Group Chat",
    removeAttachment: "Remove attachment",
    sendLoop: "Send to steerer",
    sendingLoop: "Sending...",
    applyConfig: "Apply",
    effortLabel: "effort",
    modelLabel: "model",
    waitingSteerer: "Waiting for steerer response.",
    waitingOutput: "Waiting for agent output.",
    loadingSessions: "Loading sessions...",
    readableOutput: "Readable Output",
    rawOutput: "Raw Output",
    agentOutput: "Agent Output",
    viewRaw: "View Raw",
    viewReadable: "View Readable",
    finalSummary: "Final Summary",
    noProjection: "No readable projection available yet.",
    workflowStatus: "Workflow Status",
    currentMode: "Current mode",
    activePhase: "Active phase",
    activeAgents: "Active agents",
    claimLedger: "Claim ledger",
    archiveRower: "Archive",
    evidenceTruth: "Evidence truth",
    phaseTimeline: "Phase timeline",
    agentWaves: "Agent wave",
    advancedDebug: "Advanced",
    claimTable: "Claim table",
    costTrace: "Cost trace",
    finalReport: "Final report",
    workflowControls: "Workflow controls",
    expandWorkflow: "Expand workflow",
    collapseWorkflow: "Collapse workflow",
    pauseWorkflow: "Pause workflow",
    resumeWorkflow: "Resume workflow",
    stopWorkflow: "Stop workflow",
    browserEvidence: "Browser evidence",
    noClaims: "No claims yet.",
    noAgentWaves: "No agent waves yet.",
    noWorkflowEvents: "No workflow events yet.",
    emptyTitle: "Start DragonBoat from your project terminal",
    emptyBody:
      "Open a terminal in the project you want DragonBoat to coordinate. When the foreground Codex steerer starts, this command deck will populate automatically.",
    emptyCommandLabel: "Recommended command",
    emptyHint: "The web panel observes existing DragonBoat runs; it does not create a foreground Codex session by itself.",
    emptyErrorHint: "DragonBoat API is not reachable yet. Keep the deck process running and start the steerer from a project terminal."
  },
  zh: {
    activeMailbox: "活跃信箱",
    agentLanguage: "Agent 消息：中文",
    agentConsole: "Agent 控制台",
    commandDeck: "可视化监工",
    crewNetwork: "Agent 关系网络",
    eventStream: "事件流",
    evidenceQueue: "证据队列",
    exportReplay: "导出回放 MP4",
    exportReady: "回放已生成",
    attachFiles: "添加文件",
    edgeHistory: "链路消息",
    graphEmpty: "这条关系链暂无消息。",
    humanLoopCaption: "Human loop 发送给主 Agent",
    humanLoopPlaceholder: "输入新的调整指令，回车发送给主 Agent。",
    humanPromptLayer: "Human Prompt 层",
    runFullstackCase: "运行全栈案例",
    humanInput: "人类输入会先传给主 Agent。",
    humanLabel: "人类",
    languageButton: "EN",
    mainAgent: "主 Agent",
    mailboxEmpty: "暂无活跃信箱消息。",
    mailboxSignals: "点对点消息",
    monitoring: "实时协作关系图",
    modelRouting: "模型路由配置",
    modelRoutingHint: "DragonBoat 记录的路由；前台 Codex 内切换后请用 dragonboat config set 同步。",
    recordContract: "记录后端契约",
    rowers: "划手",
    runClaudeWorker: "运行 Claude 划手",
    runRealCliCrew: "运行真实 CLI 队伍",
    runSimulatedCrew: "运行模拟队伍",
    sessionRail: "DragonBoat sessions",
    noSessionsRailHint: "在终端启动鼓手后，这里会自动出现 run。",
    cliMirror: "CLI 镜像",
    viewCli: "查看 CLI",
    terminalEmpty: "暂无终端输出。",
    currentFolder: "当前目录",
    confirmWorkspace: "跟踪这个文件夹",
    deleteSession: "删除会话",
    parentFolder: "上级目录",
    steerer: "鼓手",
    steererConversation: "主 Agent 气泡",
    steererHistory: "历史会话记录",
    steererHistoryEmpty: "暂无 human loop 会话记录。",
    taskGraph: "任务图",
    themeButtonDark: "深色",
    themeButtonLight: "浅色",
    themeDark: "主题：深色",
    themeLight: "主题：浅色",
    mailboxTimeline: "Agents 群聊",
    removeAttachment: "移除附件",
    sendLoop: "发送给主 Agent",
    sendingLoop: "发送中...",
    applyConfig: "应用",
    effortLabel: "effort",
    modelLabel: "model",
    waitingSteerer: "等待主 Agent 回复。",
    waitingOutput: "等待 Agent 输出。",
    loadingSessions: "正在加载会话...",
    readableOutput: "可读输出",
    rawOutput: "原始输出",
    agentOutput: "Agent 输出",
    viewRaw: "查看原始",
    viewReadable: "查看可读",
    finalSummary: "最终总结",
    noProjection: "暂无可读输出。",
    workflowStatus: "Workflow 状态",
    currentMode: "当前模式",
    activePhase: "当前阶段",
    activeAgents: "活跃 Agent",
    claimLedger: "Claim 账本",
    archiveRower: "归档",
    evidenceTruth: "证据真相",
    phaseTimeline: "阶段时间线",
    agentWaves: "Agent wave",
    advancedDebug: "高级调试",
    claimTable: "Claim table",
    costTrace: "成本追踪",
    finalReport: "最终报告",
    workflowControls: "Workflow 控制",
    expandWorkflow: "展开 workflow",
    collapseWorkflow: "收起 workflow",
    pauseWorkflow: "暂停 workflow",
    resumeWorkflow: "恢复 workflow",
    stopWorkflow: "停止 workflow",
    browserEvidence: "Browser evidence",
    noClaims: "暂无 claims。",
    noAgentWaves: "暂无 agent waves。",
    noWorkflowEvents: "暂无 workflow 事件。",
    emptyTitle: "从项目终端启动 Codex 鼓手",
    emptyBody:
      "DragonBoat Web 面板只观察由 CLI 创建的前台会话。请在要协作的项目目录打开终端，然后运行下面的命令拉起 Codex 鼓手。",
    emptyCommandLabel: "推荐命令",
    emptyHint: "Web 面板只负责观察和回放已有 DragonBoat run，不会在浏览器里直接创建前台 Codex 会话。",
    emptyErrorHint: "DragonBoat API 暂不可用。请确认 deck 进程仍在运行，再从项目终端启动鼓手。"
  }
} satisfies Record<Locale, Record<string, string>>;

function deckApiUrl() {
  const configured = import.meta.env.VITE_DRAGONBOAT_API_URL;
  return typeof configured === "string" && configured.trim() ? configured.trim() : "http://127.0.0.1:8787";
}

function deckWebUrl() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "http://127.0.0.1:5173";
  }

  return window.location.origin;
}

function steerCommandSnippet() {
  return [
    "cd /path/to/your/project",
    `DRAGONBOAT_API_URL=${deckApiUrl()} DRAGONBOAT_WEB_URL=${deckWebUrl()} dragonboat steer`
  ].join("\n");
}

function platformLabel(platform: string) {
  return platform === "codex_cli" ? "Codex CLI" : "Claude Code CLI";
}

function platformLogo(platform: string) {
  return platform === "codex_cli" ? "/assets/brand/codex.jpeg" : "/assets/brand/claude.png";
}

function brandWordmark(theme: Theme) {
  return theme === "dark" ? "/assets/brand/dragonboat-wordmark-dark.png" : "/assets/brand/dragonboat-wordmark.png";
}

function titleCaseAgentSlug(slug: string) {
  return slug
    .split("_")
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function isCanonicalAgentId(agentId: string) {
  return CREW_AGENT_IDS.has(agentId);
}

function dynamicAgentSlug(agentId: string) {
  return agentId.startsWith("agent_") ? agentId.slice("agent_".length) : agentId;
}

interface AgentDisplayMetadata {
  displayName?: string;
  displayRoleEn?: string;
  displayRoleZh?: string;
  displayTaskEn?: string;
  displayTaskZh?: string;
}

interface LocalizedRoleDisplay {
  en: string;
  taskEn: string;
  taskZh: string;
  zh: string;
}

const DYNAMIC_ROLE_DISPLAY: Record<string, LocalizedRoleDisplay> = {
  content_archaeologist_v2: {
    en: "Content Archaeologist Rower",
    taskEn: "Content archaeology task",
    taskZh: "内容考古任务",
    zh: "内容考古划手"
  },
  frontend_reference_research: {
    en: "Frontend Reference Researcher Rower",
    taskEn: "Frontend reference research task",
    taskZh: "前端参考研究任务",
    zh: "前端参考研究划手"
  },
  persona_synthesis: {
    en: "Persona Synthesizer Rower",
    taskEn: "Persona synthesis task",
    taskZh: "人格画像任务",
    zh: "人格画像划手"
  },
  portfolio_gsap_designer: {
    en: "Portfolio GSAP Designer Rower",
    taskEn: "Portfolio GSAP design task",
    taskZh: "作品集动效设计任务",
    zh: "作品集动效设计划手"
  },
  portfolio_gsap_recovery: {
    en: "Portfolio GSAP Recovery Rower",
    taskEn: "Portfolio GSAP recovery task",
    taskZh: "作品集动效修复任务",
    zh: "作品集动效修复划手"
  },
  portfolio_kimi_visual_review_round2: {
    en: "Portfolio Kimi Visual Review Rower",
    taskEn: "Portfolio visual review task",
    taskZh: "作品集视觉复审任务",
    zh: "作品集视觉复审划手"
  },
  portfolio_visual_reviewer: {
    en: "Portfolio Visual Reviewer Rower",
    taskEn: "Portfolio visual review task",
    taskZh: "作品集视觉评审任务",
    zh: "作品集视觉评审划手"
  },
  privacy_editor_v2: {
    en: "Privacy Editor Rower",
    taskEn: "Privacy editing task",
    taskZh: "隐私编辑任务",
    zh: "隐私编辑划手"
  },
  product_archaeology: {
    en: "Product Archaeologist Rower",
    taskEn: "Product archaeology task",
    taskZh: "产品考古任务",
    zh: "产品考古划手"
  },
  project_cartography: {
    en: "Project Cartographer Rower",
    taskEn: "Project Cartography task",
    taskZh: "项目地图任务",
    zh: "项目地图划手"
  },
  project_cartographer: {
    en: "Project Cartographer Rower",
    taskEn: "Project Cartography task",
    taskZh: "项目地图任务",
    zh: "项目地图划手"
  },
  timeline_designer_v2: {
    en: "Timeline Designer Rower",
    taskEn: "Timeline design task",
    taskZh: "时间线设计任务",
    zh: "时间线设计划手"
  },
  visual_qa: {
    en: "Visual QA Rower",
    taskEn: "Visual QA task",
    taskZh: "视觉 QA 任务",
    zh: "视觉 QA 划手"
  },
  visual_review: {
    en: "Visual Review Rower",
    taskEn: "Visual review task",
    taskZh: "视觉评审任务",
    zh: "视觉评审划手"
  },
  voice_editor_v2: {
    en: "Voice Editor Rower",
    taskEn: "Voice editing task",
    taskZh: "声音编辑任务",
    zh: "声音编辑划手"
  }
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function latestDisplayMetadata(run: DemoRun, agentId: string): AgentDisplayMetadata {
  const events = [...run.events].reverse();

  for (const event of events) {
    if (event.type !== "task.packet.created") {
      continue;
    }

    if (stringPayload(event, "owner") !== agentId && stringPayload(event, "agentId") !== agentId) {
      continue;
    }

    return {
      displayName: firstString(event.payload?.displayName, event.payload?.display_name),
      displayRoleEn: firstString(event.payload?.displayRoleEn, event.payload?.display_role_en, event.payload?.displayRole),
      displayRoleZh: firstString(event.payload?.displayRoleZh, event.payload?.display_role_zh),
      displayTaskEn: firstString(event.payload?.displayTaskEn, event.payload?.display_task_en),
      displayTaskZh: firstString(event.payload?.displayTaskZh, event.payload?.display_task_zh)
    };
  }

  return {};
}

function roleDisplayKey(member: DemoRun["crew"]["steerer"]) {
  return (member.role || dynamicAgentSlug(member.id)).toLowerCase();
}

function looksLikeGenericRoleShell(member: DemoRun["crew"]["steerer"]) {
  const expectedName = `${titleCaseAgentSlug(member.role)} Rower`;
  const staleShellNames = new Set([
    expectedName,
    "Backend Review Rower",
    "Product Research Rower",
    "Interface Integration Rower",
    "Qa Ops Rower",
    "QA Ops Rower"
  ].map(normalizeDisplayText));

  return staleShellNames.has(normalizeDisplayText(member.name));
}

function agentDisplayName(
  member: DemoRun["crew"]["steerer"],
  locale: Locale = "en",
  metadata: AgentDisplayMetadata = {}
) {
  if (member.platform === "codex_cli" || isCanonicalAgentId(member.id)) {
    return member.name;
  }

  if (locale === "zh") {
    return (
      metadata.displayRoleZh ??
      DYNAMIC_ROLE_DISPLAY[roleDisplayKey(member)]?.zh ??
      (looksLikeGenericRoleShell(member) ? `${titleCaseAgentSlug(dynamicAgentSlug(member.id))} 划手` : member.name)
    );
  }

  return (
    metadata.displayName ??
    metadata.displayRoleEn ??
    DYNAMIC_ROLE_DISPLAY[roleDisplayKey(member)]?.en ??
    `${titleCaseAgentSlug(dynamicAgentSlug(member.id))} Rower`
  );
}

function agentDisplayRole(
  member: DemoRun["crew"]["steerer"],
  locale: Locale = "en",
  metadata: AgentDisplayMetadata = {}
) {
  if (member.platform === "codex_cli" || isCanonicalAgentId(member.id)) {
    return member.role;
  }

  if (locale === "zh") {
    return metadata.displayRoleZh ?? DYNAMIC_ROLE_DISPLAY[roleDisplayKey(member)]?.zh ?? dynamicAgentSlug(member.id);
  }

  if (metadata.displayRoleEn) {
    return metadata.displayRoleEn.replace(/\s+Rower$/i, "");
  }

  return dynamicAgentSlug(member.id);
}

function normalizeDisplayText(value: string) {
  return value.replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function graphTaskTitle(
  member: DemoRun["crew"]["steerer"],
  task?: DemoRun["tasks"][number],
  locale: Locale = "en",
  metadata: AgentDisplayMetadata = {}
) {
  if (!task) {
    return `${platformLabel(member.platform)} / ${agentDisplayRole(member, locale, metadata)}`;
  }

  if (member.platform === "codex_cli" || isCanonicalAgentId(member.id)) {
    return task.title;
  }

  const dictionary = DYNAMIC_ROLE_DISPLAY[roleDisplayKey(member)];
  if (locale === "zh" && (metadata.displayTaskZh || dictionary)) {
    return metadata.displayTaskZh ?? dictionary?.taskZh ?? task.title;
  }
  if (locale === "en" && (metadata.displayTaskEn || dictionary)) {
    return metadata.displayTaskEn ?? dictionary?.taskEn ?? task.title;
  }

  const roleShellTitle = `${titleCaseAgentSlug(member.role)} task`;
  const staleRoleShellTitles = new Set(
    [roleShellTitle, "Backend Review task", "Product Research task", "Interface Integration task", "Qa Ops task", "QA Ops task"].map(
      normalizeDisplayText
    )
  );
  if (staleRoleShellTitles.has(normalizeDisplayText(task.title))) {
    return locale === "zh"
      ? `${titleCaseAgentSlug(dynamicAgentSlug(member.id))} 任务`
      : `${titleCaseAgentSlug(dynamicAgentSlug(member.id))} task`;
  }

  return task.title;
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function avatarForAgent(runId: string, agentId: string) {
  const index = (stableHash(`${runId}:${agentId}`) % 9) + 1;
  return `/assets/avatars/agent-avatar-${String(index).padStart(2, "0")}.png`;
}

function agentMotif(role: string) {
  return role === "steerer" ? "/assets/brand/agent-drum.png" : "/assets/brand/agent-paddles.png";
}

const CREW_AGENT_IDS = new Set<string>(["agent_codex", "agent_frontend", "agent_backend", "agent_qa_ops"]);

function isCrewAgentId(agentId: string): agentId is CrewAgentId {
  return CREW_AGENT_IDS.has(agentId);
}

function terminalButtonLabel(
  labels: (typeof COPY)[Locale],
  member: DemoRun["crew"]["steerer"],
  locale: Locale = "en",
  metadata: AgentDisplayMetadata = {}
) {
  return `${labels.viewCli.replace(" CLI", "")} ${agentDisplayName(member, locale, metadata)} CLI`;
}

function statusLabel(status: string, locale: Locale) {
  const en: Record<string, string> = {
    blocked: "blocked",
    contract_received: "contract received",
    done: "done",
    evidence_submitted: "evidence submitted",
    handoff_sent: "handoff sent",
    planning: "planning",
    ready: "waiting",
    reviewed: "reviewed",
    reviewing: "reviewing",
    running: "working",
    steering: "steering",
    stopped: "stopped",
    verified: "verified",
    watching: "watching"
  };
  const zh: Record<string, string> = {
    blocked: "阻塞",
    contract_received: "已收到契约",
    done: "完成",
    evidence_submitted: "已提交证据",
    handoff_sent: "已交接",
    planning: "规划中",
    ready: "等待中",
    reviewed: "已验收",
    reviewing: "验收中",
    running: "工作中",
    steering: "掌舵中",
    stopped: "已停止",
    verified: "已验证",
    watching: "监听中"
  };

  return (locale === "zh" ? zh : en)[status] ?? status;
}

function isAgentSpeech(line: string) {
  const trimmedLine = line.trim();
  return Boolean(trimmedLine) && !trimmedLine.startsWith("$") && !trimmedLine.startsWith("[stdout]") && !trimmedLine.startsWith("[stderr]");
}

function latestTaskForAgent(run: DemoRun, agentId: string) {
  return run.tasks.find((task) => task.owner === agentId);
}

const TERMINAL_TASK_STATUSES = new Set<DemoRun["tasks"][number]["status"]>(["done", "reviewed", "stopped", "verified"]);
const TERMINAL_AGENT_STATUSES = new Set<DemoRun["crew"]["rowers"][number]["status"]>(["blocked", "done", "stopped"]);

function isTerminalTaskStatus(status?: DemoRun["tasks"][number]["status"]) {
  return status !== undefined && TERMINAL_TASK_STATUSES.has(status);
}

function isTerminalAgentStatus(status: DemoRun["crew"]["rowers"][number]["status"]) {
  return TERMINAL_AGENT_STATUSES.has(status);
}

function rowerSpawnSeq(run: DemoRun, agentId: string) {
  return run.events.reduce((latestSeq, event) => {
    if (
      (event.type === "crew.member.registered" && event.actor === agentId) ||
      (event.type === "task.packet.created" && stringPayload(event, "owner") === agentId) ||
      (event.type === "workflow.agent.spawned" && stringPayload(event, "agentId") === agentId)
    ) {
      return Math.max(latestSeq, event.seq);
    }

    return latestSeq;
  }, 0);
}

function latestCrewWaveEvent(run: DemoRun) {
  return [...run.events].reverse().find((event) => event.type === "crew.wave.started");
}

function archivedRowerIdsAfter(run: DemoRun, minSeq = 0) {
  const archived = new Set<string>();

  for (const event of run.events) {
    if (event.seq < minSeq) {
      continue;
    }

    if (event.type === "crew.wave.started") {
      for (const agentId of stringArrayPayload(event, "archivedAgentIds")) {
        archived.add(agentId);
      }
    }

    if (event.type === "crew.member.archived") {
      const agentId = stringPayload(event, "agentId");
      if (agentId) {
        archived.add(agentId);
      }
    }
  }

  return archived;
}

function filterRunToVisibleRowers(run: DemoRun, visibleRowerIds: Set<string>) {
  return {
    ...run,
    crew: {
      ...run.crew,
      rowers: run.crew.rowers.filter((rower) => visibleRowerIds.has(rower.id))
    },
    tasks: run.tasks.filter((task) => task.owner === run.crew.steerer.id || visibleRowerIds.has(task.owner)),
    agentLogs: run.agentLogs.filter((log) => log.agentId === run.crew.steerer.id || visibleRowerIds.has(log.agentId))
  };
}

function projectCrewPresentationRun(run: DemoRun) {
  const explicitWave = latestCrewWaveEvent(run);
  if (explicitWave) {
    const archivedIds = archivedRowerIdsAfter(run, explicitWave.seq);
    const visibleRowerIds = new Set(
      [
        ...stringArrayPayload(explicitWave, "activeAgentIds"),
        ...run.crew.rowers
          .filter((rower) => rowerSpawnSeq(run, rower.id) >= explicitWave.seq)
          .map((rower) => rower.id)
      ].filter((agentId) => !archivedIds.has(agentId))
    );

    return filterRunToVisibleRowers(run, visibleRowerIds);
  }

  const archivedIds = archivedRowerIdsAfter(run);
  const activeRowers = run.crew.rowers.filter((rower) => {
    const task = latestTaskForAgent(run, rower.id);
    return !archivedIds.has(rower.id) && !isTerminalAgentStatus(rower.status) && !isTerminalTaskStatus(task?.status);
  });

  if (activeRowers.length === 0) {
    return archivedIds.size > 0
      ? filterRunToVisibleRowers(
          run,
          new Set(run.crew.rowers.filter((rower) => !archivedIds.has(rower.id)).map((rower) => rower.id))
        )
      : run;
  }

  return filterRunToVisibleRowers(run, new Set(activeRowers.map((rower) => rower.id)));
}

function latestAgentSpeech(run: DemoRun, agentId: string) {
  return run.agentLogs
    .filter((log) => log.agentId === agentId && isAgentSpeech(log.line))
    .slice(-1)[0]?.line;
}

function latestAdjustmentForAgent(run: DemoRun, agentId: string) {
  return run.agentLogs
    .filter((log) => log.agentId === agentId && /^(收到最新调整|Received latest adjustment)/.test(log.line))
    .slice(-1)[0]?.line;
}

function isUserFacingMailboxMessage(message: DemoRun["mailbox"][number]) {
  if (message.type === "instruction") {
    return false;
  }

  return !message.body.trim().startsWith("# Task Packet:");
}

const CANONICAL_CHAT_NAMES_ZH: Record<string, string> = {
  agent_backend: "后端划手",
  agent_frontend: "前端划手",
  agent_qa_ops: "QA/Ops 划手"
};

function fallbackChatName(agentId: string, locale: Locale) {
  if (agentId === "human") {
    return locale === "zh" ? "人类" : "Human";
  }
  if (agentId === "advisor") {
    return "Advisor";
  }
  if (agentId === "agent_codex") {
    return "Codex Steerer";
  }

  const roleKey = dynamicAgentSlug(agentId).toLowerCase();
  const roleDisplay = DYNAMIC_ROLE_DISPLAY[roleKey];
  if (locale === "zh") {
    return roleDisplay?.zh ?? `${titleCaseAgentSlug(roleKey)} 划手`;
  }
  return roleDisplay?.en ?? titleCaseAgentSlug(roleKey);
}

function fallbackChatAvatar(agentId: string, locale: Locale) {
  if (agentId === "human") {
    return locale === "zh" ? "人" : "H";
  }
  if (agentId === "advisor") {
    return "A";
  }
  return fallbackChatName(agentId, locale).slice(0, 1).toUpperCase();
}

function crewMemberById(run: DemoRun, agentId: string) {
  return [run.crew.steerer, ...run.crew.rowers].find((member) => member.id === agentId);
}

function chatDisplayName(run: DemoRun, agentId: string, locale: Locale) {
  const member = crewMemberById(run, agentId);
  if (!member) {
    return fallbackChatName(agentId, locale);
  }
  if (locale === "zh" && CANONICAL_CHAT_NAMES_ZH[member.id]) {
    return CANONICAL_CHAT_NAMES_ZH[member.id];
  }
  return agentDisplayName(member, locale, latestDisplayMetadata(run, member.id));
}

function chatAvatar(run: DemoRun, agentId: string, locale: Locale) {
  const member = crewMemberById(run, agentId);
  if (!member) {
    return { fallback: fallbackChatAvatar(agentId, locale), src: undefined };
  }
  if (member.platform === "codex_cli") {
    return { fallback: undefined, src: platformLogo(member.platform) };
  }
  return { fallback: undefined, src: avatarForAgent(run.runId, member.id) };
}

function chatRouteSummary(run: DemoRun, agentId: string) {
  if (!crewMemberById(run, agentId)) {
    return null;
  }

  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index];
    if (event.type !== "route.decision.recorded" && event.type !== "agent.config.updated") {
      continue;
    }

    const eventAgentId = stringPayload(event, "agentId") || event.actor;
    if (eventAgentId !== agentId) {
      continue;
    }

    const model = stringPayload(event, "model");
    const effort = stringPayload(event, "effort");
    if (!model && !effort) {
      continue;
    }

    return [model, effort].filter(Boolean).join(" / ");
  }

  return null;
}

interface HumanLoopComposerProps {
  focusSignal: number;
  isSending: boolean;
  locale: Locale;
  onSubmit(input: { body: string; files: File[] }): Promise<void>;
}

function HumanLoopComposer({ focusSignal, isSending, locale, onSubmit }: HumanLoopComposerProps) {
  const labels = COPY[locale];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const canSubmit = body.trim().length > 0 && !isSending;

  useEffect(() => {
    if (focusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    await onSubmit({ body: body.trim(), files });
    setBody("");
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form className="human-loop-composer" aria-label={labels.humanLoopCaption} onSubmit={handleSubmit}>
      <div className="composer-topline">
        <span>{labels.humanLoopCaption}</span>
        {files.length > 0 ? (
          <div className="attachment-strip">
            {files.map((file) => (
              <button
                aria-label={`${labels.removeAttachment}: ${file.name}`}
                className="attachment-chip"
                key={`${file.name}-${file.size}-${file.lastModified}`}
                onClick={() => setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile !== file))}
                type="button"
              >
                {file.name}
                <X aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="composer-row">
        <button
          aria-label={labels.attachFiles}
          className="composer-icon-button"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <Paperclip aria-hidden="true" />
        </button>
        <input
          accept="image/*,.txt,.md,.json,.diff,.patch,.pdf"
          hidden
          multiple
          onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
          ref={fileInputRef}
          type="file"
        />
        <textarea
          aria-label={labels.humanLoopPlaceholder}
          onChange={(event) => setBody(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={labels.humanLoopPlaceholder}
          ref={textareaRef}
          rows={1}
          value={body}
        />
        <button className="composer-send-button" disabled={!canSubmit} type="submit">
          <Send aria-hidden="true" />
          <span>{isSending ? labels.sendingLoop : labels.sendLoop}</span>
        </button>
      </div>
    </form>
  );
}

function stringPayload(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function stringArrayPayload(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function formatUsd(value: number) {
  return `$${value.toFixed(3)}`;
}

function formatEventPayload(event: DemoEvent) {
  if (event.type === "command.output") {
    return stringPayload(event, "line");
  }

  if (event.type === "mailbox.message.sent") {
    return stringPayload(event, "body");
  }

  if (event.type === "advisor.message.sent") {
    return stringPayload(event, "body");
  }

  if (event.type === "route.decision.recorded") {
    const agentId = stringPayload(event, "agentId");
    const model = stringPayload(event, "model");
    const effort = stringPayload(event, "effort");
    const reason = stringPayload(event, "reason");
    return `${agentId}: ${model}${effort ? ` / ${effort}` : ""}${reason ? ` / ${reason}` : ""}`;
  }

  if (event.type === "task.status_changed") {
    const status = stringPayload(event, "status");
    const progress = event.payload?.progress;
    return `${status}${typeof progress === "number" ? ` / ${progress}%` : ""}`;
  }

  if (event.type === "evidence.submitted" || event.type === "steerer.review.completed") {
    const title = stringPayload(event, "title");
    const status = stringPayload(event, "status");
    return `${title}${status ? ` / ${status}` : ""}`;
  }

  return stringPayload(event, "title");
}

function latestRouteDecision(events: DemoEvent[], agentId: string) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "route.decision.recorded") {
      continue;
    }

    if (stringPayload(event, "agentId") !== agentId) {
      continue;
    }

    const model = stringPayload(event, "model");
    const effort = stringPayload(event, "effort");

    if (!model && !effort) {
      continue;
    }

    return {
      effort: effort as AgentEffort | "",
      model
    };
  }

  return null;
}

function projectDisplayAgentConfigs(configs: AgentRuntimeConfigs | null, events: DemoEvent[]) {
  if (!configs) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(configs).map(([agentId, config]) => {
      const route = latestRouteDecision(events, agentId);
      if (!route || config.model.trim()) {
        return [agentId, config];
      }

      return [
        agentId,
        {
          ...config,
          effort: (route.effort || config.effort) as AgentEffort,
          model: route.model || config.model
        }
      ];
    })
  ) as AgentRuntimeConfigs;
}

interface GraphMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  body: string;
  createdAt: string;
}

interface SteererHistoryRecord {
  id: string;
  kind: "human" | "steerer";
  route: string;
  body: string;
  createdAt: string;
}

interface CrewNodeData extends Record<string, unknown> {
  avatarSrc?: string;
  config?: AgentRuntimeConfigs[CrewAgentId];
  displayMetadata?: AgentDisplayMetadata;
  labels: (typeof COPY)[Locale];
  latestAdjustment?: string;
  latestSpeech?: string;
  locale: Locale;
  member: DemoRun["crew"]["steerer"];
  onApplyConfig: (agentId: CrewAgentId, input: { effort: AgentEffort; model: string }) => void;
  onFocusComposer: () => void;
  onOpenHistory: () => void;
  onOpenTerminal: (member: DemoRun["crew"]["steerer"]) => void;
  onArchiveRower?: (agentId: string) => void;
  task?: DemoRun["tasks"][number];
}

type CrewGraphNode = Node<CrewNodeData, "agent">;

interface CrewEdgeData extends Record<string, unknown> {
  isPinned: boolean;
  kind: "steerer" | "peer";
  label: string;
  locale: Locale;
  messages: GraphMessage[];
  onPinEdge: (edgeId: string) => void;
  onUnpinEdge: () => void;
}

type CrewGraphEdge = Edge<CrewEdgeData, "crewLink">;
type GraphLayout = "desktop" | "narrow";

const GRAPH_STORAGE_PREFIX = "dragonboat.demo.crewGraph.positions.v15";
const GRAPH_STORAGE_VERSION_KEY = "dragonboat.demo.crewGraph.positions.activeVersion";

const DESKTOP_GRAPH_POSITIONS: Record<string, { x: number; y: number }> = {
  agent_codex: { x: 444, y: 4 },
  agent_frontend: { x: 160, y: 120 },
  agent_backend: { x: 456, y: 120 },
  agent_qa_ops: { x: 752, y: 120 }
};

const NARROW_GRAPH_POSITIONS: Record<string, { x: number; y: number }> = {
  agent_codex: { x: 46, y: 18 },
  agent_frontend: { x: 46, y: 420 },
  agent_backend: { x: 46, y: 696 },
  agent_qa_ops: { x: 46, y: 972 }
};

function graphLayout(): GraphLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "desktop";
  }

  return window.matchMedia("(max-width: 680px)").matches ? "narrow" : "desktop";
}

function defaultGraphPositions(layout: GraphLayout = graphLayout()) {
  return layout === "narrow" ? NARROW_GRAPH_POSITIONS : DESKTOP_GRAPH_POSITIONS;
}

function defaultGraphViewport(layout: GraphLayout = graphLayout()) {
  return layout === "narrow" ? { x: 14, y: 10, zoom: 0.9 } : { x: 18, y: -4, zoom: 0.88 };
}

function defaultPositionForMember(member: DemoRun["crew"]["steerer"], index: number, layout: GraphLayout) {
  const fixed = defaultGraphPositions(layout)[member.id];
  if (fixed) {
    return fixed;
  }

  if (member.role === "steerer" || member.platform === "codex_cli") {
    return layout === "narrow" ? { x: 46, y: 18 } : { x: 444, y: 4 };
  }

  if (layout === "narrow") {
    return { x: 46, y: 420 + index * 276 };
  }

  const columnWidth = 296;
  const row = Math.floor(index / 4);
  const column = index % 4;
  return {
    x: 160 + column * columnWidth,
    y: 120 + row * 260
  };
}

function formatTime(createdAt: string, locale: Locale) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.valueOf())) {
    return createdAt;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function compareByTime(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function edgeIdFor(source: string, target: string, kind: "steerer" | "peer") {
  return `edge-${kind}-${source}-${target}`;
}

function pairMessages(run: DemoRun, source: string, target: string): GraphMessage[] {
  return run.mailbox
    .filter((message) => {
      return (message.from === source && message.to === target) || (message.from === target && message.to === source);
    })
    .map((message) => ({
      id: message.id,
      from: message.from,
      to: message.to,
      type: message.type,
      body: message.body,
      createdAt: message.createdAt
    }))
    .sort(compareByTime);
}

function steererHistory(run: DemoRun): SteererHistoryRecord[] {
  const humanMessages: SteererHistoryRecord[] = run.mailbox
    .filter((message) => message.from === "human" && message.to === run.crew.steerer.id)
    .map((message) => ({
      id: message.id,
      kind: "human",
      route: `${message.from} -> ${message.to}`,
      body: message.body,
      createdAt: message.createdAt
    }));
  const steererMessages: SteererHistoryRecord[] = run.agentLogs
    .filter((log) => log.agentId === run.crew.steerer.id && isAgentSpeech(log.line))
    .map((log) => ({
      id: log.id,
      kind: "steerer",
      route: run.crew.steerer.name,
      body: log.line,
      createdAt: log.createdAt
    }));

  return [...humanMessages, ...steererMessages].sort(compareByTime);
}

function storedPositionKey(runId: string, layout: GraphLayout = graphLayout()) {
  return `${GRAPH_STORAGE_PREFIX}:${layout}:${runId}`;
}

function ensureGraphStorageVersion() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (window.localStorage.getItem(GRAPH_STORAGE_VERSION_KEY) === GRAPH_STORAGE_PREFIX) {
    return;
  }

  Object.keys(window.localStorage)
    .filter((key) => key.startsWith("dragonboat.demo.crewGraph.positions."))
    .forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(GRAPH_STORAGE_VERSION_KEY, GRAPH_STORAGE_PREFIX);
}

function loadStoredPositions(runId: string, layout: GraphLayout = graphLayout()): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return {};
  }

  ensureGraphStorageVersion();
  const raw = window.localStorage.getItem(storedPositionKey(runId, layout));
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, position]) => {
        return typeof position?.x === "number" && typeof position?.y === "number";
      })
    );
  } catch {
    return {};
  }
}

function saveStoredPositions(runId: string, nodes: CrewGraphNode[], layout: GraphLayout = graphLayout()) {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function" || nodes.length === 0) {
    return;
  }

  const positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
  window.localStorage.setItem(storedPositionKey(runId, layout), JSON.stringify(positions));
}

function currentPositions(nodes: CrewGraphNode[], runId: string, layout: GraphLayout = graphLayout()) {
  const storedPositions = loadStoredPositions(runId, layout);
  const hasStoredPositions = Object.keys(storedPositions).length > 0;

  return {
    ...defaultGraphPositions(layout),
    ...storedPositions,
    ...(hasStoredPositions ? Object.fromEntries(nodes.map((node) => [node.id, node.position])) : {})
  };
}

function buildCrewNodes(
  run: DemoRun,
  locale: Locale,
  labels: (typeof COPY)[Locale],
  positions: Record<string, { x: number; y: number }>,
  layout: GraphLayout,
  configs: AgentRuntimeConfigs | null,
  onApplyConfig: (agentId: CrewAgentId, input: { effort: AgentEffort; model: string }) => void,
  onFocusComposer: () => void,
  onOpenHistory: () => void,
  onOpenTerminal: (member: DemoRun["crew"]["steerer"]) => void,
  onArchiveRower?: (agentId: string) => void
): CrewGraphNode[] {
  const members = [run.crew.steerer, ...run.crew.rowers];

  return members.map((member, index) => {
    const isSteerer = member.platform === "codex_cli" || member.role === "steerer";
    return {
      id: member.id,
      type: "agent",
      position: positions[member.id] ?? defaultPositionForMember(member, Math.max(0, index - 1), layout),
      data: {
        avatarSrc: isSteerer ? undefined : avatarForAgent(run.runId, member.id),
        config: isCrewAgentId(member.id) ? configs?.[member.id] : undefined,
        displayMetadata: latestDisplayMetadata(run, member.id),
        labels,
        latestAdjustment: latestAdjustmentForAgent(run, member.id),
        latestSpeech: latestAgentSpeech(run, member.id),
        locale,
        member,
        onApplyConfig,
        onArchiveRower,
        onFocusComposer,
        onOpenHistory,
        onOpenTerminal,
        task: latestTaskForAgent(run, member.id)
      },
      draggable: true
    };
  });
}

function buildCrewEdges(
  run: DemoRun,
  locale: Locale,
  pinnedEdgeId: string | null,
  onPinEdge: (edgeId: string) => void,
  onUnpinEdge: () => void
): CrewGraphEdge[] {
  const steererId = run.crew.steerer.id;
  const steererEdges: CrewGraphEdge[] = run.crew.rowers.map((rower) => {
    const id = edgeIdFor(steererId, rower.id, "steerer");
    return {
      id,
      type: "crewLink",
      source: steererId,
      sourceHandle: "bottom",
      target: rower.id,
      targetHandle: "top",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        isPinned: pinnedEdgeId === id,
        kind: "steerer",
        label: `${steererId} -> ${rower.id}`,
        locale,
        messages: pairMessages(run, steererId, rower.id),
        onPinEdge,
        onUnpinEdge
      }
    };
  });

  const peerEdges: CrewGraphEdge[] = run.crew.rowers.flatMap((sourceRower, sourceIndex) => {
    return run.crew.rowers.slice(sourceIndex + 1).flatMap((targetRower) => {
      const source = sourceRower.id;
      const target = targetRower.id;
      const messages = pairMessages(run, source, target);

      if (run.crew.rowers.length > MAX_ROWERS_WITH_EMPTY_PEER_LINKS && messages.length === 0) {
        return [];
      }

      const id = edgeIdFor(source, target, "peer");
      return [{
        id,
        type: "crewLink",
        source,
        sourceHandle: "right",
        target,
        targetHandle: "left",
        data: {
          isPinned: pinnedEdgeId === id,
          kind: "peer",
          label: `${source} <-> ${target}`,
          locale,
          messages,
          onPinEdge,
          onUnpinEdge
        }
      }];
    });
  });

  return [...steererEdges, ...peerEdges];
}

function AgentConfigControl({ data }: { data: CrewNodeData }) {
  const agentId = data.member.id;
  const config = data.config;
  const displayName = agentDisplayName(data.member, data.locale, data.displayMetadata);
  const [isOpen, setIsOpen] = useState(false);
  const [draftModel, setDraftModel] = useState(config?.model ?? "");
  const [draftEffort, setDraftEffort] = useState<AgentEffort>(
    config?.effort ?? (data.member.platform === "codex_cli" ? "xhigh" : "max")
  );

  useEffect(() => {
    if (config) {
      setDraftModel(config.model);
      setDraftEffort(config.effort);
    }
  }, [config]);

  if (!isCrewAgentId(agentId) || !config) {
    return null;
  }

  const apply = (next = { effort: draftEffort, model: draftModel }) => {
    data.onApplyConfig(agentId, next);
  };

  return (
    <div className={`node-config-control nodrag nopan ${isOpen ? "is-open" : ""}`}>
      <button
        className="node-config-trigger"
        type="button"
        aria-label={`${displayName} ${data.labels.modelRouting}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <SlidersHorizontal aria-hidden="true" />
        {data.labels.modelRouting}
      </button>
      <form
        aria-label={`${displayName} ${data.labels.modelRouting}`}
        className="node-config-popover"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label>
          <span>{data.labels.modelLabel}</span>
          <input
            aria-label={`${displayName} model`}
            onChange={(event) => setDraftModel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
            placeholder={config.provider === "codex_cli" ? "gpt-5.5" : "glm-5.1"}
            value={draftModel}
          />
        </label>
        <label>
          <span>{data.labels.effortLabel}</span>
          <select
            aria-label={`${displayName} effort`}
            onChange={(event) => {
              const effort = event.target.value as AgentEffort;
              setDraftEffort(effort);
              apply({ effort, model: draftModel });
            }}
            value={draftEffort}
          >
            {effortOptionsFor(config.provider).map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{data.labels.applyConfig}</button>
        <p className="node-config-note">{data.labels.modelRoutingHint}</p>
      </form>
    </div>
  );
}

function AgentGraphNode({ data }: NodeProps<CrewGraphNode>) {
  const isSteerer = data.member.role === "steerer";
  const labels = data.labels;
  const displayName = agentDisplayName(data.member, data.locale, data.displayMetadata);
  const displayRole = agentDisplayRole(data.member, data.locale, data.displayMetadata);

  return (
    <article
      className={`graph-agent-card ${isSteerer ? "graph-steerer-card" : "graph-rower-card"} status-${data.member.status}`}
      title={`${displayName} / ${statusLabel(data.member.status, data.locale)}`}
    >
      <Handle className="graph-handle graph-handle-top" id="top" position={Position.Top} type="target" />
      <Handle className="graph-handle graph-handle-left" id="left" position={Position.Left} type="target" />
      <Handle className="graph-handle graph-handle-right" id="right" position={Position.Right} type="source" />
      <Handle className="graph-handle graph-handle-bottom" id="bottom" position={Position.Bottom} type="source" />
      <img className="agent-motif" src={agentMotif(data.member.role)} alt="" />
      {!isSteerer && data.avatarSrc ? (
        <div className="agent-avatar-frame" aria-hidden="true">
          <img className="agent-avatar" data-testid={`agent-avatar-${data.member.id}`} src={data.avatarSrc} alt="" />
        </div>
      ) : null}
      <img className="agent-platform-logo" src={platformLogo(data.member.platform)} alt="" />
      {!isSteerer && data.onArchiveRower ? (
        <button
          aria-label={`${labels.archiveRower} ${displayName}`}
          className="agent-archive-button nodrag nopan"
          onClick={(event) => {
            event.stopPropagation();
            data.onArchiveRower?.(data.member.id);
          }}
          title={`${labels.archiveRower} ${displayName}`}
          type="button"
        >
          <Archive aria-hidden="true" />
        </button>
      ) : null}
      <span>{isSteerer ? labels.mainAgent : displayRole}</span>
      <h3>{displayName}</h3>
      <p>{graphTaskTitle(data.member, data.task, data.locale, data.displayMetadata)}</p>
      <div className="agent-status-row">
        <strong>{statusLabel(data.member.status, data.locale)}</strong>
        <button
          aria-label={terminalButtonLabel(data.labels, data.member, data.locale, data.displayMetadata)}
          className="agent-cli-button nodrag nopan"
          onClick={() => data.onOpenTerminal(data.member)}
          type="button"
        >
          <TerminalSquare aria-hidden="true" />
          {data.labels.viewCli}
        </button>
      </div>
      <AgentConfigControl data={data} />
      {data.latestAdjustment ? <div className="rower-live-bubble">{data.latestAdjustment}</div> : null}
      {isSteerer ? (
        <div className="steerer-node-actions">
          <button aria-label={labels.steererHistory} onClick={data.onOpenHistory} type="button">
            <History aria-hidden="true" />
            {labels.steererHistory}
          </button>
        </div>
      ) : null}
      <div className="agent-tooltip">
        {data.latestSpeech ? `${data.labels.waitingOutput.replace("等待 Agent 输出。", "最近输出")} ${data.latestSpeech}` :
          (data.task ? `${graphTaskTitle(data.member, data.task, data.locale, data.displayMetadata)} / ${statusLabel(data.task.status, data.locale)}` : statusLabel(data.member.status, data.locale))}
      </div>
    </article>
  );
}

function CrewLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data
}: EdgeProps<CrewGraphEdge>) {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: data?.kind === "peer" ? 0.22 : 0.42
  });
  const messages = data?.messages ?? [];
  const lastMessage = messages.at(-1);
  const isOpen = isHovered || data?.isPinned;
  const locale = data?.locale ?? "zh";

  return (
    <>
      <BaseEdge
        className={`crew-flow-edge crew-flow-edge-${data?.kind ?? "steerer"}`}
        id={id}
        interactionWidth={28}
        markerEnd={markerEnd}
        path={edgePath}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-message-anchor ${isOpen ? "is-open" : ""}`}
          onClick={() => data?.onPinEdge(id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              data?.onPinEdge(id);
            }
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          role="button"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          tabIndex={0}
        >
          <span>{data?.label}</span>
          <small>
            {lastMessage
              ? `${formatTime(lastMessage.createdAt, locale)} / ${lastMessage.type}`
              : data?.locale === "en"
                ? "No messages"
                : "暂无消息"}
          </small>
          {isOpen ? (
            <div className="edge-message-popover" role="dialog" aria-label={data?.label}>
              <div className="edge-popover-title">
                <strong>{data?.label}</strong>
                {data?.isPinned ? (
                  <button
                    aria-label="Close link messages"
                    onClick={(event) => {
                      event.stopPropagation();
                      data.onUnpinEdge();
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {messages.length === 0 ? (
                <p className="muted-line">{data?.locale === "en" ? COPY.en.graphEmpty : COPY.zh.graphEmpty}</p>
              ) : (
                <div className="edge-message-list">
                  {messages.map((message) => (
                    <article className="edge-message-row" key={message.id}>
                      <div>
                        <strong>{`${message.from} -> ${message.to}`}</strong>
                        <span>{formatTime(message.createdAt, locale)}</span>
                      </div>
                      <small>{message.type}</small>
                      <p>{message.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function EdgeMessageList({
  labels,
  locale,
  messages
}: {
  labels: (typeof COPY)[Locale];
  locale: Locale;
  messages: GraphMessage[];
}) {
  if (messages.length === 0) {
    return <p className="muted-line">{labels.graphEmpty}</p>;
  }

  return (
    <div className="edge-message-list">
      {messages.map((message) => (
        <article className="edge-message-row" key={message.id}>
          <div>
            <strong>{`${message.from} -> ${message.to}`}</strong>
            <span>{formatTime(message.createdAt, locale)}</span>
          </div>
          <small>{message.type}</small>
          <p>{message.body}</p>
        </article>
      ))}
    </div>
  );
}

function LinkMessagesWindow({
  edge,
  labels,
  locale,
  onClose
}: {
  edge: CrewGraphEdge;
  labels: (typeof COPY)[Locale];
  locale: Locale;
  onClose: () => void;
}) {
  return (
    <aside className="link-history-window" aria-label={labels.edgeHistory}>
      <div className="history-titlebar">
        <div>
          <span>{labels.mailboxSignals}</span>
          <h3>{edge.data?.label}</h3>
        </div>
        <Clock3 aria-hidden="true" />
        <button aria-label={labels.removeAttachment} onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </div>
      <EdgeMessageList labels={labels} locale={locale} messages={edge.data?.messages ?? []} />
    </aside>
  );
}

function GraphRelationshipIndex({
  edges,
  labels,
  onPinEdge
}: {
  edges: CrewGraphEdge[];
  labels: (typeof COPY)[Locale];
  onPinEdge: (edgeId: string) => void;
}) {
  return (
    <nav className="graph-link-index" aria-label={labels.edgeHistory}>
      {edges.map((edge) => (
        <button className={edge.data?.isPinned ? "is-active" : ""} key={edge.id} onClick={() => onPinEdge(edge.id)} type="button">
          <span>{edge.data?.label}</span>
          <small>{edge.data?.messages.length ?? 0}</small>
        </button>
      ))}
    </nav>
  );
}

function GraphTerminalShortcuts({
  locale,
  labels,
  onOpenTerminal,
  run
}: {
  locale: Locale;
  labels: (typeof COPY)[Locale];
  onOpenTerminal: (member: DemoRun["crew"]["steerer"]) => void;
  run: DemoRun;
}) {
  const members = [run.crew.steerer, ...run.crew.rowers];

  return (
    <div className="graph-terminal-shortcuts" aria-label={labels.cliMirror}>
      {members.map((member) => (
        <button key={member.id} onClick={() => onOpenTerminal(member)} type="button">
          <TerminalSquare aria-hidden="true" />
          {terminalButtonLabel(labels, member, locale, latestDisplayMetadata(run, member.id))}
        </button>
      ))}
    </div>
  );
}

function SteererHistoryWindow({
  labels,
  locale,
  onClose,
  records
}: {
  labels: (typeof COPY)[Locale];
  locale: Locale;
  onClose: () => void;
  records: SteererHistoryRecord[];
}) {
  return (
    <aside className="steerer-history-window" aria-label={labels.steererHistory}>
      <div className="history-titlebar">
        <div>
          <span>{labels.humanPromptLayer}</span>
          <h3>{labels.steererHistory}</h3>
        </div>
        <Clock3 aria-hidden="true" />
        <button aria-label={labels.removeAttachment} onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </div>
      {records.length === 0 ? (
        <p className="muted-line">{labels.steererHistoryEmpty}</p>
      ) : (
        <div className="history-record-list">
          {records.map((record) => (
            <article className={`history-record history-record-${record.kind}`} key={record.id}>
              <div>
                <strong>{record.route}</strong>
                <span>{formatTime(record.createdAt, locale)}</span>
              </div>
              <p>{record.body}</p>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

const nodeTypes = {
  agent: AgentGraphNode
};

const edgeTypes = {
  crewLink: CrewLinkEdge
};

function FitViewEffect({ recenterKey }: { recenterKey: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (recenterKey > 0) {
      fitView({
        maxZoom: graphLayout() === "narrow" ? 0.9 : 0.88,
        padding: graphLayout() === "narrow" ? 0.08 : 0.3
      });
    }
  }, [fitView, recenterKey]);

  return null;
}

function CrewGraph({
  agentConfigs,
  locale,
  onApplyConfig,
  onArchiveRower,
  onFocusComposer,
  onOpenTerminal,
  recenterKey,
  run
}: {
  agentConfigs: AgentRuntimeConfigs | null;
  locale: Locale;
  onApplyConfig: (agentId: CrewAgentId, input: { effort: AgentEffort; model: string }) => void;
  onArchiveRower?: (agentId: string) => void;
  onFocusComposer: () => void;
  onOpenTerminal: (member: DemoRun["crew"]["steerer"]) => void;
  recenterKey: number;
  run: DemoRun;
}) {
  const labels = COPY[locale];
  const rowerCountLabel = `1 ${labels.steerer} / ${run.crew.rowers.length} ${labels.rowers}`;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [pinnedEdgeId, setPinnedEdgeId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CrewGraphNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CrewGraphEdge>([]);
  const [graphLayoutMode, setGraphLayoutMode] = useState<GraphLayout>(() => graphLayout());
  const previousGraphLayout = useRef<GraphLayout>(graphLayoutMode);
  const initialViewport = useMemo(() => defaultGraphViewport(graphLayoutMode), [graphLayoutMode]);
  const historyRecords = useMemo(() => steererHistory(run), [run]);
  const graphIdentityKey = useMemo(
    () => [graphLayoutMode, run.runId, run.crew.steerer.id, ...run.crew.rowers.map((rower) => rower.id)].join(":"),
    [graphLayoutMode, run.crew.rowers, run.crew.steerer.id, run.runId]
  );
  const openHistory = useCallback(() => setIsHistoryOpen(true), []);
  const closeHistory = useCallback(() => setIsHistoryOpen(false), []);
  const pinEdge = useCallback((edgeId: string) => setPinnedEdgeId(edgeId), []);
  const unpinEdge = useCallback(() => setPinnedEdgeId(null), []);
  const relationshipEdges = useMemo(
    () => (edges.length > 0 ? edges : buildCrewEdges(run, locale, pinnedEdgeId, pinEdge, unpinEdge)),
    [edges, locale, pinEdge, pinnedEdgeId, run, unpinEdge]
  );
  const pinnedEdge = useMemo(() => relationshipEdges.find((edge) => edge.id === pinnedEdgeId), [pinnedEdgeId, relationshipEdges]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const query = window.matchMedia("(max-width: 680px)");
    const syncLayout = () => setGraphLayoutMode(query.matches ? "narrow" : "desktop");
    syncLayout();
    query.addEventListener("change", syncLayout);

    return () => {
      query.removeEventListener("change", syncLayout);
    };
  }, []);

  useEffect(() => {
    setNodes((currentNodes) => {
      const shouldPreserveCurrentPositions = previousGraphLayout.current === graphLayoutMode;
      const nextNodes = buildCrewNodes(
        run,
        locale,
        labels,
        currentPositions(shouldPreserveCurrentPositions ? currentNodes : [], run.runId, graphLayoutMode),
        graphLayoutMode,
        agentConfigs,
        onApplyConfig,
        onFocusComposer,
        openHistory,
        onOpenTerminal,
        onArchiveRower
      );
      previousGraphLayout.current = graphLayoutMode;
      return nextNodes;
    });
  }, [agentConfigs, graphLayoutMode, labels, locale, onApplyConfig, onArchiveRower, onFocusComposer, onOpenTerminal, openHistory, run, setNodes]);

  useEffect(() => {
    setEdges(buildCrewEdges(run, locale, pinnedEdgeId, pinEdge, unpinEdge));
  }, [locale, pinEdge, pinnedEdgeId, run, setEdges, unpinEdge]);

  useEffect(() => {
    saveStoredPositions(run.runId, nodes, graphLayoutMode);
  }, [graphLayoutMode, nodes, run.runId]);

  return (
    <section className="panel crew-graph-panel" aria-labelledby="network-heading">
      <div className="panel-heading panel-heading-rich">
        <div>
          <p>{labels.monitoring}</p>
          <h2 id="network-heading">{labels.crewNetwork}</h2>
        </div>
        <span className="network-count">{rowerCountLabel}</span>
      </div>

      <div className="crew-flow-stage">
        <ReactFlow
          key={graphIdentityKey}
          colorMode="light"
          defaultViewport={initialViewport}
          edgeTypes={edgeTypes}
          edges={edges}
          fitView
          fitViewOptions={{ maxZoom: graphLayoutMode === "narrow" ? 0.9 : 0.7, padding: graphLayoutMode === "narrow" ? 0.08 : 0.3 }}
          maxZoom={1.12}
          minZoom={0.62}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          panOnScroll
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          zoomOnPinch
          zoomOnScroll={false}
        >
          <Background color="rgba(12, 143, 134, 0.16)" gap={28} size={1} />
          <FitViewEffect recenterKey={recenterKey} />
        </ReactFlow>
        <GraphTerminalShortcuts labels={labels} locale={locale} onOpenTerminal={onOpenTerminal} run={run} />
        <GraphRelationshipIndex edges={relationshipEdges} labels={labels} onPinEdge={pinEdge} />
        {pinnedEdge ? <LinkMessagesWindow edge={pinnedEdge} labels={labels} locale={locale} onClose={unpinEdge} /> : null}
        {isHistoryOpen ? (
          <SteererHistoryWindow labels={labels} locale={locale} onClose={closeHistory} records={historyRecords} />
        ) : null}
      </div>
    </section>
  );
}

function workflowClaims(events: DemoEvent[]): ClaimLedgerEntry[] {
  let claims: ClaimLedgerEntry[] = [];

  for (const event of events) {
    if (event.type === "claim.submitted") {
      claims = updateClaimLedger(claims, [
        {
          claim: stringPayload(event, "claim"),
          claimId: stringPayload(event, "claimId"),
          confidence: stringPayload(event, "confidence") as ClaimLedgerEntry["confidence"],
          sourceAgent: stringPayload(event, "sourceAgent") || event.actor,
          sources: stringArrayPayload(event, "sources"),
          status: "unverified",
          updatedAt: event.createdAt
        }
      ]);
    }

    if (event.type === "claim.reviewed") {
      const status = stringPayload(event, "status");
      claims = updateClaimLedger(claims, [
        {
          claimId: stringPayload(event, "claimId"),
          finalSynthesisIncluded: event.payload?.finalSynthesisIncluded === true,
          sourceAgent: stringPayload(event, "sourceAgent"),
          sources: stringArrayPayload(event, "sources"),
          status:
            status === "supported" || status === "refuted" || status === "conflicted" || status === "needs_human"
              ? status
              : "unverified",
          updatedAt: event.createdAt,
          verifierAgent: stringPayload(event, "verifierAgent") || event.actor
        }
      ]);
    }
  }

  return claims.filter((claim) => claim.claimId);
}

function workflowAgentWaves(events: DemoEvent[]) {
  return events
    .filter((event) => event.type === "workflow.agent.spawned" || event.type === "workflow.agent.stopped")
    .map((event) => ({
      agentId: stringPayload(event, "agentId") || event.actor,
      createdAt: event.createdAt,
      phaseId: stringPayload(event, "phaseId") || stringPayload(event, "phase_id") || "unphased",
      status: event.type === "workflow.agent.spawned" ? "spawned" : "stopped",
      workflowId: stringPayload(event, "workflowId") || stringPayload(event, "workflow_id")
    }));
}

function browserEvidenceEvents(events: DemoEvent[]) {
  return events.filter(
    (event) =>
      event.type === "browser.capability.checked" ||
      (event.type === "evidence.gate.checked" && stringPayload(event, "taskType") === "browser_research")
  );
}

function hasWorkflowRuntimeHistory(events: DemoEvent[]) {
  return events.some(
    (event) =>
      event.type === "workflow.phase.started" ||
      event.type === "workflow.phase.completed" ||
      event.type === "workflow.agent.spawned" ||
      event.type === "workflow.agent.stopped" ||
      event.type === "workflow.supervision.blocked" ||
      event.type === "workflow.control.requested" ||
      event.type === "workflow.acceptance.completed"
  );
}

function WorkflowStatusPanel({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];
  const summary = useMemo(() => summarizeWorkflowEvents(run.events), [run.events]);
  const hasWorkflowHistory = useMemo(() => hasWorkflowRuntimeHistory(run.events), [run.events]);
  const [expandedByRun, setExpandedByRun] = useState<Record<string, boolean>>({});
  const claims = useMemo(() => workflowClaims(run.events), [run.events]);
  const waves = useMemo(() => workflowAgentWaves(run.events), [run.events]);
  const browserEvidence = useMemo(() => browserEvidenceEvents(run.events), [run.events]);
  const costTrace = useMemo(() => createCostTrace(run.events), [run.events]);
  const claimEntries = Object.entries(summary.claimCounts).filter(([, count]) => count > 0);
  const phaseEntries = Object.entries(summary.phaseStatuses);
  const isExpanded = expandedByRun[run.runId] ?? hasWorkflowHistory;
  const toggleWorkflow = () => {
    setExpandedByRun((current) => ({ ...current, [run.runId]: !isExpanded }));
  };

  return (
    <section className={`panel workflow-panel ${isExpanded ? "is-expanded" : "is-collapsed"}`} aria-label={labels.workflowStatus}>
      <div className="panel-heading panel-heading-split">
        <div className="panel-heading-label">
          <ListTree aria-hidden="true" />
          <h2>{labels.workflowStatus}</h2>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? labels.collapseWorkflow : labels.expandWorkflow}
          className="workflow-toggle"
          onClick={toggleWorkflow}
          type="button"
        >
          {isExpanded ? labels.collapseWorkflow : labels.expandWorkflow}
        </button>
      </div>
      {!isExpanded ? (
        <p className="muted-line workflow-collapsed-note">{labels.noWorkflowEvents}</p>
      ) : (
        <>
          <div className="workflow-metrics">
            <article>
              <span>{labels.currentMode}</span>
              <strong>{summary.mode}</strong>
            </article>
            <article>
              <span>{labels.activePhase}</span>
              <strong>{summary.activePhaseId ?? "none"}</strong>
            </article>
            <article>
              <span>{labels.activeAgents}</span>
              <strong>{summary.activeAgentCount}</strong>
            </article>
            <article>
              <span>{labels.claimLedger}</span>
              <strong className="workflow-claim-counts">
                {claimEntries.length > 0 ? claimEntries.map(([status, count]) => <span key={status}>{`${status}: ${count}`}</span>) : "none"}
              </strong>
            </article>
            <article>
              <span>{labels.evidenceTruth}</span>
              <strong>{summary.truthStatus}</strong>
            </article>
          </div>
          {phaseEntries.length > 0 ? (
            <div className="workflow-phase-list">
              {phaseEntries.map(([phaseId, status]) => (
                <span key={phaseId}>
                  {phaseId} / {status}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted-line">{labels.noWorkflowEvents}</p>
          )}
          <div className="workflow-deep-grid">
            <section className="workflow-subpanel">
              <h3>{labels.phaseTimeline}</h3>
              {phaseEntries.length > 0 ? (
                <ol className="workflow-list">
                  {phaseEntries.map(([phaseId, status]) => (
                    <li key={phaseId}>
                      <strong>{phaseId}</strong>
                      <span>{status}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{labels.noWorkflowEvents}</p>
              )}
            </section>

            <section className="workflow-subpanel">
              <h3>{labels.agentWaves}</h3>
              {waves.length > 0 ? (
                <ol className="workflow-list">
                  {waves.map((wave) => (
                    <li key={`${wave.agentId}-${wave.status}-${wave.createdAt}`}>
                      <strong>{wave.agentId}</strong>
                      <span>{`${wave.phaseId} / ${wave.status} / ${formatTime(wave.createdAt, locale)}`}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{labels.noAgentWaves}</p>
              )}
            </section>

            <section className="workflow-subpanel">
              <h3>{labels.claimTable}</h3>
              {claims.length > 0 ? (
                <div className="workflow-claim-table">
                  {claims.map((claim) => (
                    <article key={claim.claimId}>
                      <strong>{claim.claimId}</strong>
                      <span>{claim.status}</span>
                      <p>{claim.claim || `${claim.sourceAgent || "unknown"} -> ${claim.verifierAgent || "unverified"}`}</p>
                      <small>{(claim.sources ?? []).join(", ") || "no source"}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p>{labels.noClaims}</p>
              )}
            </section>

            <section className="workflow-subpanel">
              <h3>{labels.costTrace}</h3>
              <div className="workflow-cost-row">
                <span>total</span>
                <strong>{formatUsd(costTrace.totalEstimatedCostUsd)}</strong>
              </div>
              <div className="workflow-cost-row">
                <span>waste</span>
                <strong>{formatUsd(costTrace.wastedEstimatedCostUsd)}</strong>
              </div>
              <div className="workflow-cost-row">
                <span>tokens</span>
                <strong>{costTrace.totalTokens}</strong>
              </div>
            </section>

            <section className="workflow-subpanel">
              <h3>{labels.browserEvidence}</h3>
              {browserEvidence.length > 0 ? (
                <ol className="workflow-list">
                  {browserEvidence.map((event) => (
                    <li key={event.id}>
                      <strong>{stringPayload(event, "taskType") || event.type}</strong>
                      <span>{stringPayload(event, "status") || stringPayload(event, "cdp") || formatTime(event.createdAt, locale)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{labels.noWorkflowEvents}</p>
              )}
            </section>

            <section className="workflow-subpanel">
              <h3>{labels.finalReport}</h3>
              <p>{summary.truthStatus}</p>
              <small>{summary.truthStatus === "accepted" ? "submitted -> reviewable -> accepted" : "waiting for accepted synthesis"}</small>
            </section>
          </div>
          <div className="workflow-controls" aria-label={labels.workflowControls}>
            <button aria-label={labels.pauseWorkflow} type="button">
              {labels.pauseWorkflow}
            </button>
            <button aria-label={labels.resumeWorkflow} type="button">
              {labels.resumeWorkflow}
            </button>
            <button aria-label={labels.stopWorkflow} type="button">
              {labels.stopWorkflow}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function TaskBoard({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];

  return (
    <section className="panel task-panel" aria-labelledby="tasks-heading">
      <div className="panel-heading">
        <GitBranch aria-hidden="true" />
        <h2 id="tasks-heading">{labels.taskGraph}</h2>
      </div>
      <div className="task-grid">
        {run.tasks.map((task) => (
          <article className="task-row" key={task.id}>
            <div className="task-topline">
              <span>{task.lane}</span>
              <span className="status-chip">{statusLabel(task.status, locale)}</span>
            </div>
            <h3>{task.title}</h3>
            <div className="progress-track" aria-label={`${task.title} progress`}>
              <span style={{ width: `${task.progress}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MailboxPanel({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];
  const visibleMessages = [...run.mailbox]
    .filter(isUserFacingMailboxMessage)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return (
    <section className="panel mailbox-panel" aria-labelledby="mailbox-heading">
      <div className="panel-heading">
        <TerminalSquare aria-hidden="true" />
        <h2 id="mailbox-heading">{labels.mailboxTimeline}</h2>
      </div>
      <div className="agent-chat-list">
        {visibleMessages.map((message) => {
          const senderAvatar = chatAvatar(run, message.from, locale);
          const senderName = chatDisplayName(run, message.from, locale);
          const recipientName = chatDisplayName(run, message.to, locale);
          const routeSummary = chatRouteSummary(run, message.from);

          return (
            <article className="agent-chat-message" data-testid={`agent-chat-message-${message.id}`} key={message.id}>
              <div className="agent-chat-avatar" aria-hidden="true">
                {senderAvatar.src ? (
                  <img alt="" data-testid={`agent-chat-avatar-${message.id}`} src={senderAvatar.src} />
                ) : (
                  <span data-testid={`agent-chat-avatar-${message.id}`}>{senderAvatar.fallback}</span>
                )}
              </div>
              <div className="agent-chat-bubble">
                <div className="agent-chat-meta">
                  <strong>{senderName}</strong>
                  <span>{message.type}</span>
                  {routeSummary ? (
                    <span className="agent-chat-route" title={`model route: ${routeSummary}`}>
                      {routeSummary}
                    </span>
                  ) : null}
                  <time>{formatTime(message.createdAt, locale)}</time>
                </div>
                <div className="agent-chat-mention">@{recipientName}</div>
                <SimpleMarkdown content={message.body} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EvidencePanel({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];
  const claims = workflowClaims(run.events).slice(-4).reverse();

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading">
        <ShieldCheck aria-hidden="true" />
        <h2 id="evidence-heading">{labels.evidenceQueue}</h2>
      </div>
      {run.evidence.map((item) => (
        <article className="evidence-row" key={item.id}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h3>{item.title}</h3>
            <p>
              {item.taskId} / {item.status} / {formatTime(item.createdAt, locale)}
            </p>
          </div>
        </article>
      ))}
      <div className="claim-summary" aria-label={labels.claimLedger}>
        <h3>{labels.claimLedger}</h3>
        {claims.length > 0 ? (
          <div className="claim-summary-list">
            {claims.map((claim) => (
              <article className={`claim-summary-row is-${claim.status}`} key={claim.claimId}>
                <div>
                  <strong>{claim.claimId}</strong>
                  <span>{claim.status}</span>
                </div>
                <p>{claim.claim || `${claim.sourceAgent || "unknown"} -> ${claim.verifierAgent || "unverified"}`}</p>
                <small>{(claim.sources ?? []).join(", ") || "no source"}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-line">{labels.noClaims}</p>
        )}
      </div>
    </section>
  );
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (match[2] && match[3]) {
      nodes.push(
        <a href={match[3]} key={`link-${match.index}`} rel="noreferrer" target="_blank">
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`}>{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(<code key={`code-${match.index}`}>{match[5]}</code>);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function tableCells(line: string) {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const cells: string[] = [];
  let current = "";
  let inInlineCode = false;
  let escaping = false;

  for (const character of withoutOuterPipes) {
    if (escaping) {
      current += character === "|" ? "|" : `\\${character}`;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === "`") {
      inInlineCode = !inInlineCode;
      current += character;
      continue;
    }

    if (character === "|" && !inInlineCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += "\\";
  }

  cells.push(current.trim());
  return cells;
}

function isMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && tableCells(trimmed).length >= 2;
}

function isMarkdownTableDivider(line: string, expectedCellCount: number) {
  if (!isMarkdownTableRow(line)) {
    return false;
  }

  const cells = tableCells(line);
  return cells.length === expectedCellCount && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

type MarkdownTableColumnKind = "compact" | "path" | "text";
type MarkdownTableAlignment = "left" | "center" | "right";

function markdownTableAlignment(cell: string): MarkdownTableAlignment | undefined {
  const trimmed = cell.trim();
  const leftAligned = trimmed.startsWith(":");
  const rightAligned = trimmed.endsWith(":");
  if (leftAligned && rightAligned) {
    return "center";
  }
  if (rightAligned) {
    return "right";
  }
  if (leftAligned) {
    return "left";
  }
  return undefined;
}

function markdownTableAlignments(dividerLine: string, expectedCellCount: number) {
  const cells = tableCells(dividerLine);
  if (cells.length !== expectedCellCount) {
    return [];
  }
  return cells.map(markdownTableAlignment);
}

function markdownTableColumnKind(header: string, sampleValues: string[]): MarkdownTableColumnKind {
  const label = header.trim().toLowerCase();
  const content = `${label} ${sampleValues.join(" ").toLowerCase()}`;
  if (/(路径|path|file path|filepath|source url|artifact|链接|目录)/i.test(content)) {
    return "path";
  }

  const longestSample = sampleValues.reduce((longest, value) => Math.max(longest, value.trim().length), 0);
  if (/^(#|id|no\.?|序号|编号|类型|文档|状态|风险|层级)$/i.test(label) || (header.trim().length <= 4 && longestSample <= 18)) {
    return "compact";
  }

  return "text";
}

function markdownTableColumnSpecs(header: string[], rows: string[][], alignments: Array<MarkdownTableAlignment | undefined>) {
  const specs = header.map((cell, cellIndex) => {
    const sampleValues = rows.map((row) => row[cellIndex] ?? "");
    const kind = markdownTableColumnKind(cell, sampleValues);
    const weight = kind === "compact" ? 0.55 : kind === "path" ? 1.2 : 1.55;
    return { align: alignments[cellIndex], kind, weight };
  });
  const totalWeight = specs.reduce((sum, spec) => sum + spec.weight, 0);
  return specs.map((spec) => ({
    align: spec.align,
    kind: spec.kind,
    width: `${((spec.weight / totalWeight) * 100).toFixed(1)}%`
  }));
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushList = (key: string) => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(
      <ul key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  const flushCode = (key: string) => {
    if (codeLines.length === 0) {
      return;
    }
    blocks.push(
      <pre className="markdown-code" key={key}>
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
    codeLines = [];
  };

  const flushTable = (key: string, header: string[], rows: string[][], alignments: Array<MarkdownTableAlignment | undefined>) => {
    const columns = markdownTableColumnSpecs(header, rows, alignments);
    blocks.push(
      <div className="markdown-table-scroll" key={key}>
        <table className="markdown-table markdown-table-adaptive">
          <colgroup>
            {columns.map((column, columnIndex) => (
              <col
                className={`markdown-table-col markdown-table-col-${column.kind}`}
                data-column-kind={column.kind}
                key={`${key}-col-${columnIndex}`}
                style={{ width: column.width }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {header.map((cell, cellIndex) => (
                <th
                  data-align={columns[cellIndex]?.align}
                  data-column-kind={columns[cellIndex]?.kind ?? "text"}
                  key={`${key}-head-${cellIndex}`}
                >
                  {renderInlineMarkdown(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${key}-row-${rowIndex}`}>
                {header.map((_, cellIndex) => (
                  <td
                    data-align={columns[cellIndex]?.align}
                    data-column-kind={columns[cellIndex]?.kind ?? "text"}
                    key={`${key}-cell-${rowIndex}-${cellIndex}`}
                  >
                    {renderInlineMarkdown(row[cellIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushList(`list-before-code-${index}`);
      if (inCode) {
        flushCode(`code-${index}`);
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushList(`list-gap-${index}`);
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList(`list-${index}`);

    const nextLine = lines[index + 1]?.trim() ?? "";
    if (isMarkdownTableRow(trimmed) && isMarkdownTableDivider(nextLine, tableCells(trimmed).length)) {
      const header = tableCells(trimmed);
      const alignments = markdownTableAlignments(nextLine, header.length);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        const row = tableCells(lines[index]);
        if (!isMarkdownTableDivider(lines[index], header.length)) {
          rows.push(row);
        }
        index += 1;
      }

      index -= 1;
      flushTable(`table-${index}`, header, rows, alignments);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(<h3 key={`h3-${index}`}>{renderInlineMarkdown(trimmed.slice(4))}</h3>);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push(<h2 key={`h2-${index}`}>{renderInlineMarkdown(trimmed.slice(3))}</h2>);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push(<h1 key={`h1-${index}`}>{renderInlineMarkdown(trimmed.slice(2))}</h1>);
      continue;
    }

    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(trimmed)}</p>);
  }

  flushList("list-final");
  flushCode("code-final");

  return <div className="simple-markdown">{blocks}</div>;
}

function AgentOutputPanel({
  locale,
  onSelectAgent,
  projection,
  run,
  selectedAgentId
}: {
  locale: Locale;
  onSelectAgent: (agentId: string) => void;
  projection: ReadableProjection | null;
  run: DemoRun;
  selectedAgentId: string | null;
}) {
  const labels = COPY[locale];
  const [viewMode, setViewMode] = useState<"readable" | "raw">("readable");
  const members = [run.crew.steerer, ...run.crew.rowers];
  const currentAgentId = selectedAgentId ?? run.crew.rowers[0]?.id ?? run.crew.steerer.id;
  const visibleLogs = run.agentLogs.filter((log) => log.agentId === currentAgentId).slice(-20).reverse();

  return (
    <section className="panel console-panel" aria-labelledby="console-heading">
      <div className="panel-heading panel-heading-split">
        <div className="panel-heading-label">
          <TerminalSquare aria-hidden="true" />
          <h2 id="console-heading">{labels.agentOutput}</h2>
        </div>
        <div className="agent-output-tabs">
          <button
            aria-label={labels.viewReadable}
            className={viewMode === "readable" ? "is-active" : ""}
            onClick={() => setViewMode("readable")}
            type="button"
          >
            {labels.readableOutput}
          </button>
          <button
            aria-label={labels.viewRaw}
            className={viewMode === "raw" ? "is-active" : ""}
            onClick={() => setViewMode("raw")}
            type="button"
          >
            {labels.rawOutput}
          </button>
        </div>
      </div>
      <div className="agent-output-agent-picker" role="tablist" aria-label="Agent output source">
        {members.map((member) => (
          <button
            aria-pressed={member.id === currentAgentId}
            className={member.id === currentAgentId ? "is-active" : ""}
            key={member.id}
            onClick={() => onSelectAgent(member.id)}
            type="button"
          >
            {agentDisplayName(member, locale, latestDisplayMetadata(run, member.id))}
          </button>
        ))}
      </div>
      {viewMode === "readable" ? (
        <div className="readable-output">
          {projection?.assistantBlocks.length ? (
            <>
              {projection.assistantBlocks.map((block, index) => (
                <article className="readable-block" key={`${block.seq}-${index}`}>
                  {block.isMarkdown ? <SimpleMarkdown content={block.content} /> : <p>{block.content}</p>}
                </article>
              ))}
              {projection.finalSummary.content ? (
                <section aria-label={labels.finalSummary} className="final-summary">
                  <strong>{labels.finalSummary}</strong>
                  <SimpleMarkdown content={projection.finalSummary.content} />
                </section>
              ) : null}
            </>
          ) : (
            <p className="muted-line">{labels.noProjection}</p>
          )}
        </div>
      ) : (
        <div className="console-list">
          {visibleLogs.length === 0 ? (
            <p className="muted-line">{labels.waitingOutput}</p>
          ) : (
            visibleLogs.map((log) => (
              <article className="console-row" key={log.id}>
                <span>{log.agentId}</span>
                <p>{log.line}</p>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function EventStreamPanel({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];
  const visibleEvents = run.events.slice(-10).reverse();

  return (
    <section className="panel event-panel" aria-labelledby="event-heading">
      <div className="panel-heading">
        <ListTree aria-hidden="true" />
        <h2 id="event-heading">{labels.eventStream}</h2>
      </div>
      <div className="event-list">
        {visibleEvents.map((event) => (
          <article className="event-row" key={event.id}>
            <span>#{event.seq}</span>
            <strong>{event.type}</strong>
            <p>{event.actor}</p>
            {formatEventPayload(event) ? <code>{formatEventPayload(event)}</code> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function AdvancedDebugPanel({ locale, run }: { locale: Locale; run: DemoRun }) {
  const labels = COPY[locale];

  return (
    <details className="advanced-debug-panel">
      <summary>
        <ListTree aria-hidden="true" />
        <span>{labels.advancedDebug}</span>
      </summary>
      <div className="advanced-debug-grid">
        <WorkflowStatusPanel locale={locale} run={run} />
        <EventStreamPanel locale={locale} run={run} />
      </div>
    </details>
  );
}

function SessionRail({
  activeRunId,
  collapsed,
  labels,
  locale,
  onDeleteSession,
  onSelectSession,
  onToggleCollapse,
  sessions
}: {
  activeRunId: string | null;
  collapsed: boolean;
  labels: (typeof COPY)[Locale];
  locale: Locale;
  onDeleteSession: (runId: string) => void;
  onSelectSession: (runId: string) => void;
  onToggleCollapse: () => void;
  sessions: SessionSummary[];
}) {
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  return (
    <nav className={`session-rail ${collapsed ? "is-collapsed" : ""}`} aria-label={labels.sessionRail}>
      {collapsed ? (
        <div className="session-rail-collapsed">
          <button
            aria-label="Expand session rail"
            className="session-rail-toggle"
            onClick={onToggleCollapse}
            type="button"
          >
            <ListTree aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <div className="session-rail-title">
            <div className="session-rail-title-copy">
              <span>DragonBoat</span>
              <strong>runs</strong>
            </div>
            <button
              aria-label="Collapse session rail"
              className="session-rail-toggle"
              onClick={onToggleCollapse}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="session-list">
            {sessions.length === 0 ? <p className="session-rail-empty">{labels.noSessionsRailHint}</p> : null}
            {sessions.map((session) => (
              <article
                className={session.runId === activeRunId ? "session-item is-active" : "session-item"}
                key={session.runId}
                onMouseEnter={() => setHoveredSessionId(session.runId)}
                onMouseLeave={() => setHoveredSessionId((current) => (current === session.runId ? null : current))}
              >
                <button className="session-select-button" onClick={() => onSelectSession(session.runId)} type="button">
                  {session.title === session.runId ? null : <span>{session.title}</span>}
                  <strong>{session.runId}</strong>
                  <small title={session.workspaceRoot}>
                    {session.phase} / {session.activeAgentCount}
                  </small>
                </button>
                <button
                  aria-label={`${labels.deleteSession}: ${session.title}`}
                  className="session-delete-button"
                  onClick={() => onDeleteSession(session.runId)}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
                {hoveredSessionId === session.runId ? (
                  <div className="session-tooltip" role="tooltip">
                    <div>
                      <strong>title</strong>
                      <p>{session.title}</p>
                    </div>
                    <div>
                      <strong>run id</strong>
                      <p>{session.runId}</p>
                    </div>
                    <div>
                      <strong>workspace root</strong>
                      <p>{session.workspaceRoot}</p>
                    </div>
                    <div>
                      <strong>phase</strong>
                      <p>{session.phase}</p>
                    </div>
                    <div>
                      <strong>active agent count</strong>
                      <p>{String(session.activeAgentCount)}</p>
                    </div>
                    <div>
                      <strong>createdAt</strong>
                      <p>{formatTime(session.createdAt, locale)}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

function TerminalDrawer({
  buffer,
  labels,
  member,
  onClose,
  runId
}: {
  buffer: string;
  labels: (typeof COPY)[Locale];
  member: DemoRun["crew"]["steerer"];
  onClose: () => void;
  runId: string;
}) {
  const defaultPosition = () => {
    if (typeof window === "undefined") {
      return { x: 720, y: 360 };
    }

    return {
      x: Math.max(16, window.innerWidth - Math.min(760, window.innerWidth - 36) - 18),
      y: Math.max(88, window.innerHeight - 520 - 18)
    };
  };
  const [liveBuffer, setLiveBuffer] = useState(buffer);
  const [position, setPosition] = useState(defaultPosition);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setLiveBuffer(buffer);
  }, [buffer]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof WebSocket === "undefined" ||
      window.navigator.userAgent.toLowerCase().includes("jsdom")
    ) {
      return undefined;
    }

    const url = new URL(`/api/terminal/${encodeURIComponent(runId)}/${encodeURIComponent(member.id)}`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);

    socket.addEventListener("message", (event) => {
      const chunk = typeof event.data === "string" ? event.data : "";
      if (!chunk) {
        return;
      }

      setLiveBuffer((currentBuffer) => (currentBuffer.endsWith(chunk) ? currentBuffer : `${currentBuffer}${chunk}`));
    });

    return () => {
      socket.close();
    };
  }, [member.id, runId]);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const width = Math.min(760, window.innerWidth - 36);
    const height = Math.min(640, Math.round(window.innerHeight * 0.72));
    const nextX = dragRef.current.originX + event.clientX - dragRef.current.startX;
    const nextY = dragRef.current.originY + event.clientY - dragRef.current.startY;

    setPosition({
      x: Math.min(Math.max(12, nextX), Math.max(12, window.innerWidth - width - 12)),
      y: Math.min(Math.max(72, nextY), Math.max(72, window.innerHeight - height - 12))
    });
  };

  const stopDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <aside
      className="terminal-drawer"
      role="dialog"
      aria-label={labels.cliMirror}
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="terminal-titlebar"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div>
          <span>{labels.cliMirror}</span>
          <h2>{agentDisplayName(member)}</h2>
          <p>{`${member.id} / ${member.platform} / ${runId}`}</p>
        </div>
        <button aria-label={labels.removeAttachment} onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </div>
      <pre className="terminal-screen">{liveBuffer.trim() ? liveBuffer : labels.terminalEmpty}</pre>
    </aside>
  );
}

const CODEX_EFFORT_OPTIONS: AgentEffort[] = ["low", "medium", "high", "xhigh"];
const CLAUDE_EFFORT_OPTIONS: AgentEffort[] = ["low", "medium", "high", "max"];

function effortOptionsFor(provider: string) {
  return provider === "codex_cli" ? CODEX_EFFORT_OPTIONS : CLAUDE_EFFORT_OPTIONS;
}

function AgentConfigPanel({
  configs,
  labels,
  members,
  onApply
}: {
  configs: AgentRuntimeConfigs | null;
  labels: (typeof COPY)[Locale];
  members: DemoRun["crew"]["steerer"][];
  onApply: (agentId: CrewAgentId, input: { effort: AgentEffort; model: string }) => void;
}) {
  const [drafts, setDrafts] = useState<AgentRuntimeConfigs | null>(configs);

  useEffect(() => {
    setDrafts(configs);
  }, [configs]);

  if (!configs || !drafts) {
    return null;
  }

  return (
    <section className="agent-config-panel" aria-label={labels.modelRouting}>
      <div className="agent-config-heading">
        <div>
          <span>{labels.modelRouting}</span>
          <h2>{labels.modelRouting}</h2>
        </div>
        <p>{labels.modelRoutingHint}</p>
      </div>
      <div className="agent-config-grid">
        {members.map((member) => {
          const agentId = member.id as CrewAgentId;
          const draft = drafts[agentId];
          const effortOptions = effortOptionsFor(draft.provider);

          return (
            <form
              className="agent-config-card"
              key={member.id}
              onSubmit={(event) => {
                event.preventDefault();
                onApply(agentId, {
                  effort: draft.effort,
                  model: draft.model
                });
              }}
            >
              <div className="agent-config-name">
                <strong>{agentDisplayName(member)}</strong>
                <span>{platformLabel(member.platform)}</span>
              </div>
              <label>
                <span>{labels.modelLabel}</span>
                <input
                  aria-label={`${agentDisplayName(member)} model`}
                  onChange={(event) =>
                    setDrafts((currentDrafts) =>
                      currentDrafts
                        ? {
                            ...currentDrafts,
                            [agentId]: {
                              ...currentDrafts[agentId],
                              model: event.target.value
                            }
                          }
                        : currentDrafts
                    )
                  }
                  placeholder={draft.provider === "codex_cli" ? "gpt-5.5" : "glm-5.1"}
                  value={draft.model}
                />
              </label>
              <label>
                <span>{labels.effortLabel}</span>
                <select
                  aria-label={`${agentDisplayName(member)} effort`}
                  onChange={(event) =>
                    setDrafts((currentDrafts) =>
                      currentDrafts
                        ? {
                            ...currentDrafts,
                            [agentId]: {
                              ...currentDrafts[agentId],
                              effort: event.target.value as AgentEffort
                            }
                          }
                        : currentDrafts
                    )
                  }
                  value={draft.effort}
                >
                  {effortOptions.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">
                {labels.applyConfig} {agentDisplayName(member)} {labels.modelRouting.replace("模型路由配置", "配置").replace("Model Routing", "config")}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}

export function App({ api = httpDemoApiClient }: AppProps) {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<AgentRuntimeConfigs | null>(null);
  const [locale, setLocale] = useState<Locale>("zh");
  const [theme, setTheme] = useState<Theme>(() => initialTheme());
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isFullstackRunning, setIsFullstackRunning] = useState(false);
  const [isWorkerRunning, setIsWorkerRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [replayExport, setReplayExport] = useState<ReplayExportResult | null>(null);
  const [terminalTarget, setTerminalTarget] = useState<DemoRun["crew"]["steerer"] | null>(null);
  const [terminalBuffer, setTerminalBuffer] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [selectedProjectionAgent, setSelectedProjectionAgent] = useState<string | null>(null);
  const [readableProjection, setReadableProjection] = useState<ReadableProjection | null>(null);
  const [graphRecenterKey, setGraphRecenterKey] = useState(0);
  const RAIL_COLLAPSE_KEY = "dragonboat.demo.railCollapsed";
  const projectedAgentConfigs = useMemo(() => projectDisplayAgentConfigs(agentConfigs, run?.events ?? []), [agentConfigs, run?.events]);
  const presentedCrewRun = useMemo(() => (run ? projectCrewPresentationRun(run) : null), [run]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    cacheRunSnapshot(run);
  }, [run]);

  useEffect(() => {
    let isMounted = true;

    api
      .listSessions()
      .then(async (sessionResult) => {
        const nextRun = sessionResult.activeRunId ? await api.loadSession(sessionResult.activeRunId) : null;
        if (isMounted) {
          setError(null);
          setRun(nextRun);
          setSessions(sessionResult.sessions);
          setActiveRunId(sessionResult.activeRunId);
          setIsBootstrapping(false);
        }
      })
      .catch((cause: unknown) => {
        if (isMounted) {
          const cachedRun = readCachedRunSnapshot();
          if (cachedRun) {
            setRun(cachedRun);
            setActiveRunId(cachedRun.runId);
            setSessions([
              {
                activeAgentCount: [cachedRun.crew.steerer, ...cachedRun.crew.rowers].filter(
                  (agent) => !["ready", "done", "blocked", "stopped"].includes(agent.status)
                ).length,
                createdAt: "",
                phase: cachedRun.phase,
                runId: cachedRun.runId,
                title: cachedRun.runId,
                workspaceRoot: ""
              }
            ]);
          }
          setError(cause instanceof Error ? cause.message : "Unable to load run.");
          setIsBootstrapping(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [api]);

  useEffect(() => {
    if (!api.subscribeEvents || !activeRunId) {
      return undefined;
    }

    let refreshTimer: number | null = null;
    const refreshActiveRun = () => {
      Promise.all([api.loadSession(activeRunId), api.loadAgentConfigs(activeRunId)])
        .then(([nextRun, nextConfigs]) => {
          setError(null);
          setRun(nextRun);
          setAgentConfigs(nextConfigs);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Unable to refresh live event stream.");
        });
    };

    const unsubscribe = api.subscribeEvents((event) => {
      if (event.runId !== activeRunId || refreshTimer !== null) {
        return;
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshActiveRun();
      }, 250);
    }, activeRunId);

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      unsubscribe();
    };
  }, [activeRunId, api]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
      return;
    }

    if (window.localStorage.getItem(RAIL_COLLAPSE_KEY) === "true") {
      setRailCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
      return;
    }
    window.localStorage.setItem(RAIL_COLLAPSE_KEY, String(railCollapsed));
  }, [railCollapsed]);

  useEffect(() => {
    setGraphRecenterKey((current) => current + 1);
  }, [railCollapsed]);

  useEffect(() => {
    let isMounted = true;
    const refreshSessions = async () => {
      try {
        const result = await api.listSessions();
        if (!isMounted) {
          return;
        }

        setError(null);
        setSessions(result.sessions);
        const selectedRunStillExists = activeRunId ? result.sessions.some((session) => session.runId === activeRunId) : false;
        const fallbackRunId = result.activeRunId ?? result.sessions[0]?.runId ?? null;

        if (!activeRunId && fallbackRunId) {
          const nextRun = await api.loadSession(fallbackRunId);
          if (isMounted) {
            setActiveRunId(fallbackRunId);
            setRun(nextRun);
          }
        } else if (activeRunId && !selectedRunStillExists) {
          if (fallbackRunId) {
            const nextRun = await api.loadSession(fallbackRunId);
            if (isMounted) {
              setActiveRunId(fallbackRunId);
              setRun(nextRun);
            }
          } else {
            setActiveRunId(null);
            setRun(null);
          }
        }
      } catch {
        // Session polling is a best-effort bridge for foreground CLI registrations.
      }
    };
    const timer = window.setInterval(() => {
      void refreshSessions();
    }, 2500);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [activeRunId, api]);

  useEffect(() => {
    if (!run) {
      return;
    }

    let isMounted = true;
    api
      .loadAgentConfigs(run.runId)
      .then((configs) => {
        if (isMounted) {
          setError(null);
          setAgentConfigs(configs);
        }
      })
      .catch((cause: unknown) => {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Unable to load agent config.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [api, run?.runId]);

  useEffect(() => {
    if (!run) {
      setSelectedProjectionAgent(null);
      setReadableProjection(null);
      return;
    }

    const presentedRun = presentedCrewRun ?? run;
    const nextDefaultAgent = presentedRun.crew.rowers[0]?.id ?? presentedRun.crew.steerer.id;
    const allAgentIds = new Set([presentedRun.crew.steerer.id, ...presentedRun.crew.rowers.map((rower) => rower.id)]);
    setSelectedProjectionAgent((current) => (current && allAgentIds.has(current) ? current : nextDefaultAgent));
  }, [presentedCrewRun, run]);

  useEffect(() => {
    if (!run || !selectedProjectionAgent) {
      return;
    }

    let isMounted = true;
    setReadableProjection(null);
    api
      .loadReadableProjection(run.runId, selectedProjectionAgent)
      .then((projection) => {
        if (isMounted) {
          setError(null);
          setReadableProjection(projection);
        }
      })
      .catch((cause: unknown) => {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Unable to load readable projection.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [api, run, selectedProjectionAgent]);

  const recordContract = useCallback(async () => {
    setIsSending(true);
    setError(null);

    try {
      const nextRun = await api.sendMessage({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: CONTRACT_MESSAGE[locale]
      });
      setRun(nextRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record handoff.");
    } finally {
      setIsSending(false);
    }
  }, [api, locale]);

  const deleteSession = useCallback(
    async (runId: string) => {
      setError(null);

      try {
        const result = await api.deleteSession(runId);
        const nextRunId = runId === activeRunId ? result.activeRunId : activeRunId;
        setSessions(result.sessions);
        setActiveRunId(nextRunId);
        setRun(nextRunId ? await api.loadSession(nextRunId) : null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to delete session.");
      }
    },
    [activeRunId, api]
  );

  const selectSession = useCallback(
    async (runId: string) => {
      setError(null);

      try {
        const nextRun = await api.loadSession(runId);
        const result = await api.listSessions();
        setRun(nextRun);
        setSessions(result.sessions);
        setActiveRunId(runId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to switch session.");
      }
    },
    [api]
  );

  const runSimulatedCrew = useCallback(async () => {
    setIsRunning(true);
    setError(null);

    try {
      const nextRun = await api.runSimulatedCrew(locale);
      setRun(nextRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run simulated crew.");
    } finally {
      setIsRunning(false);
    }
  }, [api, locale]);

  const runClaudeWorker = useCallback(async () => {
    setIsWorkerRunning(true);
    setError(null);

    try {
      const nextRun = await api.runClaudeWorker(locale);
      setRun(nextRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run Claude worker.");
    } finally {
      setIsWorkerRunning(false);
    }
  }, [api, locale]);

  const runFullstackCase = useCallback(async () => {
    setIsFullstackRunning(true);
    setError(null);

    try {
      const nextRun = await api.runFullstackCase(locale);
      setRun(nextRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run fullstack case.");
    } finally {
      setIsFullstackRunning(false);
    }
  }, [api, locale]);

  const archiveRower = useCallback(
    async (agentId: string) => {
      if (!run) {
        return;
      }

      setError(null);

      try {
        const nextRun = await api.deleteRower(run.runId, agentId);
        setRun(nextRun);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to archive rower.");
      }
    },
    [api, run]
  );

  const updateAgentConfig = useCallback(
    async (agentId: CrewAgentId, input: { effort: AgentEffort; model: string }) => {
      if (!run) {
        return;
      }

      setError(null);

      try {
        const result = await api.updateAgentConfig(run.runId, agentId, input);
        setAgentConfigs(result.configs);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to update agent config.");
      }
    },
    [api, run]
  );

  const openTerminal = useCallback(
    async (member: DemoRun["crew"]["steerer"]) => {
      if (!run) {
        return;
      }

      setTerminalTarget(member);
      setTerminalBuffer("");
      setError(null);

      try {
        setTerminalBuffer(await api.loadTerminalBuffer(run.runId, member.id));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load terminal mirror.");
      }
    },
    [api, run]
  );

  const exportReplay = useCallback(async () => {
    setIsExporting(true);
    setError(null);

    try {
      const nextExport = await api.exportReplay(locale);
      setReplayExport(nextExport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to export replay video.");
    } finally {
      setIsExporting(false);
    }
  }, [api, locale]);

  const labels = COPY[locale];
  const themeStatus = theme === "light" ? labels.themeLight : labels.themeDark;
  const themeButton = theme === "light" ? labels.themeButtonDark : labels.themeButtonLight;
  const startCommand = steerCommandSnippet();

  if (!run) {
    return (
      <div className={`app-frame ${railCollapsed ? "rail-collapsed" : ""}`}>
        <SessionRail
          activeRunId={activeRunId}
          collapsed={railCollapsed}
          labels={labels}
          locale={locale}
          onDeleteSession={(runId) => void deleteSession(runId)}
          onSelectSession={selectSession}
          onToggleCollapse={() => setRailCollapsed((current) => !current)}
          sessions={sessions}
        />
        <main className="app-shell">
          <header className="topbar">
            <div className="brand-lockup">
              <img className="brand-wordmark" src={brandWordmark(theme)} alt="DragonBoat" />
              <div>
                <p>DragonBoat demo</p>
                <h1>{labels.commandDeck}</h1>
              </div>
            </div>
            <div className="run-actions">
              <button
                className="language-toggle"
                onClick={() => setLocale((currentLocale) => (currentLocale === "en" ? "zh" : "en"))}
                type="button"
              >
                {labels.languageButton}
              </button>
              <button
                className="theme-toggle"
                onClick={() => setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"))}
                type="button"
              >
                {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
                {themeButton}
              </button>
            </div>
          </header>
          <section className="panel empty-state">
            <TerminalSquare aria-hidden="true" />
            <p className="empty-state-kicker">DragonBoat command deck</p>
            <h1>{isBootstrapping ? labels.loadingSessions : labels.emptyTitle}</h1>
            <p>{isBootstrapping ? labels.loadingSessions : labels.emptyBody}</p>
            {isBootstrapping ? null : (
              <>
                <div className="empty-command-card">
                  <span>{labels.emptyCommandLabel}</span>
                  <pre>
                    <code>{startCommand}</code>
                  </pre>
                </div>
                <p className="empty-state-note">{labels.emptyHint}</p>
                {error ? <p className="empty-state-warning">{labels.emptyErrorHint}</p> : null}
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-frame ${railCollapsed ? "rail-collapsed" : ""}`}>
      <SessionRail
        activeRunId={activeRunId ?? run.runId}
        collapsed={railCollapsed}
        labels={labels}
        locale={locale}
        onDeleteSession={(runId) => void deleteSession(runId)}
        onSelectSession={selectSession}
        onToggleCollapse={() => setRailCollapsed((current) => !current)}
        sessions={
          sessions.length > 0
            ? sessions
            : [
                {
                  runId: run.runId,
                  title: run.runId,
                  createdAt: "",
                  phase: run.phase,
                  activeAgentCount: 1,
                  workspaceRoot: ""
                }
              ]
        }
      />
      <main className="app-shell">
        <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-wordmark" src={brandWordmark(theme)} alt="DragonBoat" />
          <div>
            <p>DragonBoat demo</p>
            <h1>{labels.commandDeck}</h1>
          </div>
        </div>
        <div className="run-actions">
          <span>{`session: ${run.runId}`}</span>
          <span>{`phase: ${run.phase}`}</span>
          <span>{labels.agentLanguage}</span>
          <span>{themeStatus}</span>
          <button
            className="language-toggle"
            onClick={() => setLocale((currentLocale) => (currentLocale === "en" ? "zh" : "en"))}
            type="button"
          >
            {labels.languageButton}
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"))}
            type="button"
          >
            {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            {themeButton}
          </button>
          <button disabled={isRunning} onClick={runSimulatedCrew} type="button">
            <Play aria-hidden="true" />
            {labels.runSimulatedCrew}
          </button>
          <button disabled={isWorkerRunning} onClick={runClaudeWorker} type="button">
            <TerminalSquare aria-hidden="true" />
            {labels.runClaudeWorker}
          </button>
          <button disabled={isFullstackRunning} onClick={runFullstackCase} type="button">
            <GitBranch aria-hidden="true" />
            {labels.runFullstackCase}
          </button>
          <button disabled={isExporting} onClick={exportReplay} type="button">
            <Download aria-hidden="true" />
            {labels.exportReplay}
          </button>
          <button disabled={isSending} onClick={recordContract} type="button">
            <Send aria-hidden="true" />
            {labels.recordContract}
          </button>
        </div>
        </header>

      {error ? <p className="inline-error">{`${error} · 正在显示最后一次成功快照。`}</p> : null}
      {replayExport ? (
        <p className="inline-success">
          {labels.exportReady}: <a href={replayExport.downloadUrl}>{replayExport.fileName}</a>
        </p>
      ) : null}

      <div className="supervisor-grid">
        <CrewGraph
          agentConfigs={projectedAgentConfigs}
          locale={locale}
          onApplyConfig={(agentId, input) => void updateAgentConfig(agentId, input)}
          onArchiveRower={(agentId) => void archiveRower(agentId)}
          onFocusComposer={() => undefined}
          onOpenTerminal={openTerminal}
          recenterKey={graphRecenterKey}
          run={presentedCrewRun ?? run}
        />
      </div>

      <div className="detail-grid">
        <MailboxPanel locale={locale} run={run} />
        <EvidencePanel locale={locale} run={run} />
        <AgentOutputPanel
          locale={locale}
          onSelectAgent={setSelectedProjectionAgent}
          projection={readableProjection}
          run={presentedCrewRun ?? run}
          selectedAgentId={selectedProjectionAgent}
        />
      </div>
      <AdvancedDebugPanel locale={locale} run={run} />
      </main>
      {terminalTarget ? (
        <TerminalDrawer
          buffer={terminalBuffer}
          labels={labels}
          member={terminalTarget}
          onClose={() => setTerminalTarget(null)}
          runId={run.runId}
        />
      ) : null}
    </div>
  );
}
