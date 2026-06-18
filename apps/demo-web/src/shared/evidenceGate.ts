import type { DemoEvent } from "./types";
import { handoffAckStatus, structuredHandoffFromEvent } from "./structuredHandoff.ts";

export type EvidenceTaskType =
  | "backend_contract"
  | "browser_research"
  | "general"
  | "research"
  | "runtime"
  | "ui"
  | "workflow_claim";

export interface EvidenceGateCheck {
  detail?: string;
  id: string;
  label: string;
  passed: boolean;
}

export interface EvidenceGateReport {
  agentId: string;
  checks: EvidenceGateCheck[];
  evidenceSeq?: number;
  reviewable: boolean;
  status: "rejected" | "reviewable";
  taskId: string;
  taskType: EvidenceTaskType;
}

function payloadString(event: DemoEvent | undefined, key: string) {
  const value = event?.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function payloadArray(event: DemoEvent | undefined, key: string) {
  const value = event?.payload?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function mailboxType(event: DemoEvent) {
  return payloadString(event, "messageType") || payloadString(event, "type");
}

function eventAgent(event: DemoEvent) {
  const record = event as DemoEvent & { agentId?: string };
  return record.actor ?? record.agentId ?? payloadString(event, "agentId") ?? payloadString(event, "from");
}

function eventTask(event: DemoEvent) {
  const record = event as DemoEvent & { taskId?: string };
  return record.taskId ?? payloadString(event, "taskId");
}

function check(id: string, label: string, passed: boolean, detail?: string): EvidenceGateCheck {
  return {
    detail,
    id,
    label,
    passed
  };
}

function includesAny(text: string, needles: string[]) {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function payloadBoolean(event: DemoEvent | undefined, key: string) {
  return event?.payload?.[key] === true;
}

export function evaluateEvidenceGate(input: {
  agentId: string;
  events: DemoEvent[];
  taskId: string;
  taskType?: EvidenceTaskType;
}): EvidenceGateReport {
  const taskType = input.taskType ?? "general";
  const evidence = input.events
    .filter((event) => event.type === "evidence.submitted" && eventAgent(event) === input.agentId && eventTask(event) === input.taskId)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);

  const priorMailbox = input.events.some(
    (event) =>
      event.type === "mailbox.message.sent" &&
      event.seq < (evidence?.seq ?? Number.POSITIVE_INFINITY) &&
      payloadString(event, "from") === input.agentId &&
      payloadString(event, "taskId") === input.taskId &&
      payloadString(event, "body").length > 0
  );
  const structuredHandoffs = input.events
    .filter((event) => event.seq < (evidence?.seq ?? Number.POSITIVE_INFINITY))
    .map(structuredHandoffFromEvent)
    .filter((handoff) => handoff !== null)
    .filter((handoff) => handoff.from === input.agentId && handoff.taskId === input.taskId);
  const priorStructuredHandoff = structuredHandoffs.some(
    (handoff) =>
      handoff.claims.length > 0 &&
      handoff.sources.length > 0 &&
      handoff.openQuestions.length > 0 &&
      handoff.requiredAction.length > 0 &&
      handoff.summary.length > 0
  );
  const recipientAckPassed = structuredHandoffs
    .filter((handoff) => handoff.ackRequired)
    .every((handoff) => Boolean(handoff.handoffId && handoffAckStatus(input.events, handoff.handoffId, evidence?.seq)));

  const commands = payloadArray(evidence, "commandsRun");
  const files = [...payloadArray(evidence, "files"), ...payloadArray(evidence, "evidenceFiles")];
  const screenshots = payloadArray(evidence, "screenshots");
  const sources = payloadArray(evidence, "sources");
  const touchedFiles = payloadArray(evidence, "touchedFiles");
  const risks = [...payloadArray(evidence, "remainingRisks"), ...payloadArray(evidence, "risks")];
  const summary = payloadString(evidence, "summary") || payloadString(evidence, "title");
  const workspaceProof = payloadString(evidence, "workspaceProof");
  const proofText = [summary, workspaceProof, ...commands, ...files, ...screenshots, ...sources, ...touchedFiles, ...risks].join("\n");
  const hasAcceptanceProof = commands.length > 0 || screenshots.length > 0 || files.length > 0 || sources.length > 0;
  const isResearchTask = taskType === "research" || taskType === "browser_research";

  const checks = [
    check("evidence_present", "evidence event exists for agent and task", Boolean(evidence)),
    check("mailbox_before_evidence", "required durable mailbox exists before evidence", priorMailbox || priorStructuredHandoff),
    check("recipient_ack", "ack-required structured handoffs are acknowledged before evidence review", recipientAckPassed),
    check("acceptance_proof", "evidence includes command, file, screenshot, or assertion proof", hasAcceptanceProof),
    check("remaining_risk_disclosure", "evidence discloses remaining risks or says none", risks.length > 0)
  ];

  if (isResearchTask) {
    const peerCheckpoint = input.events.some(
      (event) =>
        event.type === "mailbox.message.sent" &&
        event.seq < (evidence?.seq ?? Number.POSITIVE_INFINITY) &&
        payloadString(event, "from") === input.agentId &&
        payloadString(event, "taskId") === input.taskId &&
        payloadString(event, "to") !== "" &&
        payloadString(event, "to") !== input.agentId &&
        ["contract", "peer_challenge", "research", "review", "risk", "status", "worklog"].includes(mailboxType(event)) &&
        payloadString(event, "body").length > 0
    );

    checks.push(
      check("research_sources", "research evidence lists source URLs, files, or references", sources.length > 0),
      check("durable_research_artifact", "research evidence names durable handoff or evidence artifacts", files.length > 0),
      check("peer_checkpoint", "research rower produced a peer checkpoint before evidence", peerCheckpoint)
    );
  } else {
    checks.push(
      check("touched_files", "evidence lists touched files", touchedFiles.length > 0),
      check("tracked_workspace_visibility", "evidence includes tracked workspace visibility proof", workspaceProof.length > 0)
    );
  }

  if (taskType === "ui") {
    checks.push(check("ui_screenshot", "UI/UX evidence includes screenshot paths", screenshots.length > 0));
  }

  if (taskType === "browser_research") {
    checks.push(
      check("browser_screenshot", "browser research evidence includes screenshot paths", screenshots.length > 0),
      check(
        "browser_command",
        "browser research evidence names the browser/CDP/screenshot command used",
        commands.some((command) => includesAny(command, ["browser", "cdp", "chrome", "playwright", "screenshot", "web-access"]))
      )
    );
  }

  if (taskType === "runtime") {
    checks.push(
      check("runtime_hook_path", "runtime evidence names the hook or installation path", includesAny(proofText, [".codex/hooks.json", "hook"])),
      check(
        "runtime_continuation_event",
        "runtime evidence names a fresh session, /hooks check, or continuation event",
        includesAny(proofText, ["watchdog.continuation.recorded", "continuation", "/hooks", "fresh session"])
      )
    );
  }

  if (taskType === "backend_contract") {
    checks.push(
      check(
        "backend_contract_handoff",
        "backend contract evidence has a contract mailbox or contract artifact",
        input.events.some(
          (event) =>
            event.type === "mailbox.message.sent" &&
            event.seq < (evidence?.seq ?? Number.POSITIVE_INFINITY) &&
            payloadString(event, "from") === input.agentId &&
            payloadString(event, "taskId") === input.taskId &&
            mailboxType(event) === "contract"
        ) || includesAny(proofText, ["contract"])
      )
    );
  }

  if (taskType === "workflow_claim") {
    const submittedClaims = input.events.filter(
      (event) =>
        event.type === "claim.submitted" &&
        eventAgent(event) === input.agentId &&
        (eventTask(event) === input.taskId || payloadString(event, "taskId") === input.taskId)
    );
    const reviewedClaims = input.events.filter(
      (event) =>
        event.type === "claim.reviewed" &&
        (eventTask(event) === input.taskId || payloadString(event, "taskId") === input.taskId)
    );
    const sourcedClaims = submittedClaims.filter(
      (event) => payloadArray(event, "sources").length > 0 || payloadString(event, "source").length > 0
    );
    const refutedIncludedClaims = reviewedClaims.filter(
      (event) => payloadString(event, "status") === "refuted" && payloadBoolean(event, "finalSynthesisIncluded")
    );

    checks.push(
      check("claims_present", "workflow evidence includes submitted claims", submittedClaims.length > 0),
      check("claims_sourced", "critical claims include sources or artifacts", sourcedClaims.length === submittedClaims.length && submittedClaims.length > 0),
      check(
        "claims_independently_checked",
        "at least one claim has independent review or refutation",
        reviewedClaims.some((event) => ["conflicted", "needs_human", "refuted", "supported"].includes(payloadString(event, "status")))
      ),
      check(
        "refuted_claims_excluded",
        "refuted claims are not included in final synthesis",
        refutedIncludedClaims.length === 0
      )
    );
  }

  const reviewable = checks.every((item) => item.passed);

  return {
    agentId: input.agentId,
    checks,
    ...(evidence ? { evidenceSeq: evidence.seq } : {}),
    reviewable,
    status: reviewable ? "reviewable" : "rejected",
    taskId: input.taskId,
    taskType
  };
}

export function formatEvidenceGateReport(report: EvidenceGateReport) {
  const lines = [`${report.status} ${report.taskId} (${report.agentId})`];
  for (const item of report.checks) {
    lines.push(`${item.passed ? "✓" : "✗"} ${item.label}`);
    if (!item.passed && item.detail) {
      lines.push(`  ${item.detail}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
