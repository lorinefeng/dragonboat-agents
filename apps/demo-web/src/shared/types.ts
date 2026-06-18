export type AgentPlatform = "codex_cli" | "claude_code_cli";
export type AgentRole = "steerer" | "frontend" | "backend" | "qa_ops" | (string & {});
export type AgentStatus =
  | "steering"
  | "ready"
  | "watching"
  | "planning"
  | "running"
  | "reviewing"
  | "done"
  | "blocked"
  | "stopped";
export type TaskStatus =
  | "ready"
  | "watching"
  | "running"
  | "handoff_sent"
  | "contract_received"
  | "blocked"
  | "done"
  | "evidence_submitted"
  | "reviewed"
  | "stopped"
  | "verified";
export type AdvisorMessageKind = "advice" | "research" | "risk";
export type MessageType =
  | "status"
  | "contract"
  | "question"
  | "blocker"
  | "review"
  | "evidence"
  | "instruction"
  | "intent_confirmed"
  | "peer_challenge"
  | "worklog"
  | AdvisorMessageKind;
export type EvidenceStatus = "pending" | "passed" | "failed";
export type DemoPhase = "ready" | "running" | "reviewed";
export type DemoLanguage = "zh" | "en";
export type DemoEventType =
  | "run.created"
  | "run.reconciled"
  | "human.input.submitted"
  | "crew.wave.started"
  | "crew.member.archived"
  | "crew.member.registered"
  | "crew.member.status_changed"
  | "task.packet.created"
  | "task.status_changed"
  | "task.completed"
  | "handoff.submitted"
  | "handoff.acknowledged"
  | "mailbox.message.sent"
  | "advisor.message.sent"
  | "agent.config.updated"
  | "route.decision.recorded"
  | "budget.route.assessed"
  | "compute.placement.planned"
  | "privacy.route.assessed"
  | "subscription.advice.generated"
  | "capability.matrix.updated"
  | "capability.learning.updated"
  | "cost.trace.recorded"
  | "marketplace.pack.installed"
  | "delegation.fit.assessed"
  | "agentic.mode.required"
  | "agentic.mode.assessed"
  | "agentic.mode.selected"
  | "sealed.task_packet.created"
  | "workflow.plan.created"
  | "workflow.pack.installed"
  | "workflow.phase.started"
  | "workflow.phase.completed"
  | "workflow.agent.spawned"
  | "workflow.agent.stopped"
  | "workflow.acceptance.completed"
  | "workflow.control.requested"
  | "workflow.supervision.blocked"
  | "claim.submitted"
  | "claim.reviewed"
  | "browser.capability.checked"
  | "command.started"
  | "command.output"
  | "command.finished"
  | "evidence.submitted"
  | "evidence.gate.checked"
  | "benchmark.recorded"
  | "benchmark.suite.recorded"
  | "supervision.wait.completed"
  | "supervision.wait.timeout"
  | "supervision.wait.blocked"
  | "rower.stop.requested"
  | "steerer.review.completed"
  | "watchdog.continuation.recorded";

export interface CrewMember {
  id: string;
  name: string;
  platform: AgentPlatform;
  role: AgentRole;
  status: AgentStatus;
}

export interface DemoTask {
  id: string;
  title: string;
  owner: string;
  lane: string;
  status: TaskStatus;
  progress: number;
}

export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  taskId: string;
  type: MessageType;
  body: string;
  createdAt: string;
}

export interface EvidenceItem {
  id: string;
  taskId: string;
  title: string;
  status: EvidenceStatus;
  createdAt: string;
}

export interface AgentLog {
  id: string;
  agentId: string;
  line: string;
  createdAt: string;
}

export interface DemoEvent {
  id: string;
  seq: number;
  runId: string;
  type: DemoEventType;
  actor: string;
  createdAt: string;
  taskId?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
}

export interface DemoRun {
  runId: string;
  language: DemoLanguage;
  phase: DemoPhase;
  crew: {
    steerer: CrewMember;
    rowers: CrewMember[];
  };
  tasks: DemoTask[];
  mailbox: MailboxMessage[];
  evidence: EvidenceItem[];
  agentLogs: AgentLog[];
  events: DemoEvent[];
}

export interface HumanLoopAttachment {
  name: string;
  type: string;
  size: number;
  path?: string;
}

export interface SendHumanLoopInput {
  body: string;
  files?: File[];
  attachments?: HumanLoopAttachment[];
  language?: DemoLanguage;
}

export interface SendMessageInput {
  from: string;
  to: string;
  taskId: string;
  type: MessageType;
  body: string;
}

export type HandoffConfidence = "low" | "medium" | "high";
export type HandoffAckStatus = "read" | "consumed" | "question";

export interface StructuredHandoffInput {
  ackRequired: boolean;
  artifactPath?: string;
  body?: string;
  claims: string[];
  confidence: HandoffConfidence;
  from: string;
  handoffId?: string;
  openQuestions: string[];
  recipient: string;
  requiredAction: string;
  sources: string[];
  summary: string;
  taskId: string;
}

export interface HandoffAckInput {
  ackBy: string;
  handoffId: string;
  note?: string;
  status: HandoffAckStatus;
  taskId?: string;
}

export interface SendAdvisorInput {
  body: string;
  kind: AdvisorMessageKind;
  source?: string;
}

export type RowerStreamRecordType =
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "system"
  | "usage"
  | "result"
  | "raw_agent_speech"
  | "raw_noise";

export interface ReadableAssistantBlock {
  seq: number;
  content: string;
  createdAt: string;
  isMarkdown: boolean;
  source: RowerStreamRecordType;
}

export interface ReadableFinalSummary {
  content: string;
  source: "result_record" | "last_assistant_block" | "last_agent_speech" | "none";
  createdAt: string;
}

export interface ReadableProjectionStats {
  assistantBlockCount: number;
  toolUseCount: number;
  toolResultCount: number;
  systemCount: number;
  usageCount: number;
  resultCount: number;
  noiseCount: number;
}

export interface ReadableProjection {
  agentId: string;
  assistantBlocks: ReadableAssistantBlock[];
  finalSummary: ReadableFinalSummary;
  stats: ReadableProjectionStats;
}
