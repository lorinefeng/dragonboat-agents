import type { DemoEvent } from "./types";
import { parseEventRecords } from "./dragonboatEventRecord.ts";

export interface AcceptanceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface AcceptanceReport {
  checks: AcceptanceCheck[];
  passed: boolean;
  title: string;
}

const REQUIRED_ROWERS = ["agent_backend", "agent_frontend", "agent_qa_ops"] as const;

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function payloadString(event: DemoEvent, key: string) {
  return stringField(event.payload?.[key]);
}

function mailboxType(event: DemoEvent) {
  return payloadString(event, "messageType") || payloadString(event, "type");
}

function hasEvent(events: DemoEvent[], predicate: (event: DemoEvent) => boolean) {
  return events.some(predicate);
}

function firstIndex(events: DemoEvent[], predicate: (event: DemoEvent) => boolean) {
  return events.findIndex(predicate);
}

function rowerRegistered(agentId: string) {
  return (event: DemoEvent) =>
    event.type === "crew.member.registered" &&
    payloadString(event, "agentId") === agentId &&
    payloadString(event, "platform") === "claude_code_cli";
}

function taskPacketCreated(taskId: string, owner: string) {
  return (event: DemoEvent) =>
    event.type === "task.packet.created" && event.taskId === taskId && payloadString(event, "owner") === owner;
}

function mailboxSent(from: string, to: string, acceptedTypes: string[]) {
  return (event: DemoEvent) =>
    event.type === "mailbox.message.sent" &&
    payloadString(event, "from") === from &&
    payloadString(event, "to") === to &&
    payloadString(event, "body").trim().length > 0 &&
    acceptedTypes.includes(mailboxType(event));
}

function evidenceSubmitted(actor: string, taskId: string) {
  return (event: DemoEvent) =>
    event.type === "evidence.submitted" &&
    event.actor === actor &&
    event.taskId === taskId &&
    (payloadString(event, "status") === "" || payloadString(event, "status") === "passed");
}

function evidenceGateReviewable(actor: string, taskId: string) {
  return (event: DemoEvent) =>
    event.type === "evidence.gate.checked" &&
    (event.actor === actor || payloadString(event, "agentId") === actor) &&
    (event.taskId === taskId || payloadString(event, "taskId") === taskId) &&
    payloadString(event, "status") === "reviewable";
}

function evidenceReviewableAfterSubmission(events: DemoEvent[], actor: string, taskId: string) {
  const evidenceIndex = firstIndex(events, evidenceSubmitted(actor, taskId));
  const gateIndex = firstIndex(events, evidenceGateReviewable(actor, taskId));

  return evidenceIndex >= 0 && gateIndex > evidenceIndex;
}

function commandStarted(agentId: string) {
  return (event: DemoEvent) =>
    event.type === "command.started" &&
    (event.actor === agentId || payloadString(event, "agentId") === agentId) &&
    payloadString(event, "command").includes("claude");
}

function stoppedRower(event: DemoEvent) {
  return (
    event.type === "crew.member.status_changed" &&
    REQUIRED_ROWERS.includes(payloadString(event, "agentId") as (typeof REQUIRED_ROWERS)[number]) &&
    payloadString(event, "status") === "stopped"
  );
}

function check(id: string, label: string, passed: boolean, detail?: string): AcceptanceCheck {
  return {
    detail,
    id,
    label,
    passed
  };
}

export function validateFirstCrewLoopAcceptance(events: DemoEvent[]): AcceptanceReport {
  const steererIndex = firstIndex(
    events,
    (event) =>
      event.type === "crew.member.registered" &&
      payloadString(event, "agentId") === "agent_codex" &&
      payloadString(event, "platform") === "codex_cli"
  );
  const backendIndex = firstIndex(events, rowerRegistered("agent_backend"));
  const frontendIndex = firstIndex(events, rowerRegistered("agent_frontend"));
  const qaIndex = firstIndex(events, rowerRegistered("agent_qa_ops"));
  const orderedDynamicStart =
    steererIndex >= 0 && steererIndex < backendIndex && backendIndex < frontendIndex && frontendIndex < qaIndex;

  const checks = [
    check("steerer.registered", "foreground Codex steerer registered", steererIndex >= 0),
    check(
      "rowers.dynamic_order",
      "dynamic rowers registered in backend -> frontend -> qa_ops order",
      orderedDynamicStart,
      "This proves DragonBoat did not rely on a baked one-plus-three seed."
    ),
    check("task.backend", "backend task packet created", hasEvent(events, taskPacketCreated("task_backend", "agent_backend"))),
    check(
      "task.frontend",
      "frontend task packet created",
      hasEvent(events, taskPacketCreated("task_frontend", "agent_frontend"))
    ),
    check("task.qa", "qa_ops task packet created", hasEvent(events, taskPacketCreated("task_qa_ops", "agent_qa_ops"))),
    check("terminal.backend", "backend rower Claude command started", hasEvent(events, commandStarted("agent_backend"))),
    check("terminal.frontend", "frontend rower Claude command started", hasEvent(events, commandStarted("agent_frontend"))),
    check("terminal.qa", "qa_ops rower Claude command started", hasEvent(events, commandStarted("agent_qa_ops"))),
    check(
      "mailbox.backend_frontend",
      "backend -> frontend contract mailbox",
      hasEvent(events, mailboxSent("agent_backend", "agent_frontend", ["contract"]))
    ),
    check(
      "mailbox.frontend_qa",
      "frontend -> qa_ops status/review mailbox",
      hasEvent(events, mailboxSent("agent_frontend", "agent_qa_ops", ["status", "review"]))
    ),
    check(
      "mailbox.qa_steerer",
      "agent_qa_ops -> agent_codex evidence mailbox",
      hasEvent(events, mailboxSent("agent_qa_ops", "agent_codex", ["evidence", "review"]))
    ),
    check("evidence.backend", "task_backend evidence submitted", hasEvent(events, evidenceSubmitted("agent_backend", "task_backend"))),
    check(
      "evidence.frontend",
      "task_frontend evidence submitted",
      hasEvent(events, evidenceSubmitted("agent_frontend", "task_frontend"))
    ),
    check("evidence.qa", "task_qa_ops evidence submitted", hasEvent(events, evidenceSubmitted("agent_qa_ops", "task_qa_ops"))),
    check(
      "evidence.backend.reviewable",
      "task_backend evidence passed evidence gate",
      evidenceReviewableAfterSubmission(events, "agent_backend", "task_backend"),
      "Submitted evidence is not reviewable until evidence.gate.checked records status=reviewable after submission."
    ),
    check(
      "evidence.frontend.reviewable",
      "task_frontend evidence passed evidence gate",
      evidenceReviewableAfterSubmission(events, "agent_frontend", "task_frontend"),
      "Submitted evidence is not reviewable until evidence.gate.checked records status=reviewable after submission."
    ),
    check(
      "evidence.qa.reviewable",
      "task_qa_ops evidence passed evidence gate",
      evidenceReviewableAfterSubmission(events, "agent_qa_ops", "task_qa_ops"),
      "Submitted evidence is not reviewable until evidence.gate.checked records status=reviewable after submission."
    ),
    check("lifecycle.stop", "at least one rower stopped by steerer", hasEvent(events, stoppedRower))
  ];

  return {
    checks,
    passed: checks.every((item) => item.passed),
    title: "first-crew-loop"
  };
}

export function parseAcceptanceEvents(raw: string): DemoEvent[] {
  return parseEventRecords(raw);
}

export function formatAcceptanceReport(report: AcceptanceReport) {
  const status = report.passed ? "PASS" : "FAIL";
  const lines = [`${status} ${report.title}`];

  for (const item of report.checks) {
    lines.push(`${item.passed ? "✓" : "✗"} ${item.label}`);
    if (!item.passed && item.detail) {
      lines.push(`  ${item.detail}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
