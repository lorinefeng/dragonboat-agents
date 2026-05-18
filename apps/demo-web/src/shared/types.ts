export type AgentPlatform = "codex_cli" | "claude_code_cli";
export type AgentRole = "steerer" | "frontend" | "backend" | "qa_ops";
export type AgentStatus = "steering" | "ready" | "watching" | "working" | "blocked";
export type TaskStatus = "ready" | "watching" | "handoff_sent" | "contract_received" | "verified";
export type MessageType = "status" | "contract" | "question" | "blocker" | "review" | "evidence";
export type EvidenceStatus = "pending" | "passed" | "failed";

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
}

export interface DemoRun {
  runId: string;
  crew: {
    steerer: CrewMember;
    rowers: CrewMember[];
  };
  tasks: DemoTask[];
  mailbox: MailboxMessage[];
  evidence: EvidenceItem[];
}

export interface SendMessageInput {
  from: string;
  to: string;
  taskId: string;
  type: MessageType;
  body: string;
}
