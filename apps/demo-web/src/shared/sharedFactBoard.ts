import { pendingStructuredHandoffs, structuredHandoffFromEvent } from "./structuredHandoff.ts";
import type { DemoEvent } from "./types";

export type SharedFactBoardStatus =
  | "accepted"
  | "conflicted"
  | "needs_human"
  | "pending"
  | "refuted"
  | "rejected"
  | "reviewable"
  | "supported"
  | "unverified";

export interface SharedFactBoardItem {
  agentId: string;
  claimId?: string;
  confidence?: string;
  createdAt: string;
  handoffId?: string;
  id: string;
  openQuestions?: string[];
  recipient?: string;
  requiredAction?: string;
  seq: number;
  sources: string[];
  status: SharedFactBoardStatus;
  taskId?: string;
  text: string;
  verifierAgent?: string;
}

export interface SharedFactBoard {
  accepted_conclusions: SharedFactBoardItem[];
  confirmed_facts: SharedFactBoardItem[];
  conflicting_claims: SharedFactBoardItem[];
  created_at: string;
  missing_evidence: SharedFactBoardItem[];
  pending_handoffs: SharedFactBoardItem[];
  run_id: string;
  schema_version: "dragonboat.shared_fact_board.v0";
  unverified_claims: SharedFactBoardItem[];
}

export interface CreateSharedFactBoardInput {
  createdAt?: string;
  events: DemoEvent[];
  runId?: string;
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function payloadStringAny(event: DemoEvent, keys: string[]) {
  for (const key of keys) {
    const value = payloadString(event, key);
    if (value) {
      return value;
    }
  }
  return "";
}

function payloadArray(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function payloadArrayAny(event: DemoEvent, keys: string[]) {
  for (const key of keys) {
    const values = payloadArray(event, key);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function eventTaskId(event: DemoEvent) {
  return event.taskId ?? (payloadString(event, "taskId") || undefined);
}

function eventAgentId(event: DemoEvent) {
  return payloadString(event, "agentId") || event.actor;
}

function eventRunId(events: DemoEvent[], fallback?: string) {
  return fallback ?? events[0]?.runId ?? "run_unknown";
}

function normalizeReviewStatus(status: string): SharedFactBoardStatus {
  if (status === "supported" || status === "refuted" || status === "conflicted" || status === "needs_human") {
    return status;
  }
  if (status === "reviewable" || status === "rejected" || status === "accepted") {
    return status;
  }
  return "unverified";
}

function claimItemFromSubmitted(event: DemoEvent): SharedFactBoardItem | null {
  const claimId = payloadStringAny(event, ["claimId", "claim_id"]);
  const text = payloadStringAny(event, ["claim", "text", "summary"]);

  if (!claimId || !text) {
    return null;
  }

  return {
    agentId: eventAgentId(event),
    claimId,
    confidence: payloadString(event, "confidence") || undefined,
    createdAt: event.createdAt,
    id: claimId,
    seq: event.seq,
    sources: payloadArray(event, "sources"),
    status: "unverified",
    taskId: eventTaskId(event),
    text
  };
}

function reviewItem(event: DemoEvent, submitted?: SharedFactBoardItem): SharedFactBoardItem | null {
  const claimId = payloadStringAny(event, ["claimId", "claim_id"]);
  if (!claimId) {
    return null;
  }

  const status = normalizeReviewStatus(payloadString(event, "status"));
  const note = payloadString(event, "note");

  return {
    agentId: submitted?.agentId ?? eventAgentId(event),
    claimId,
    confidence: submitted?.confidence,
    createdAt: event.createdAt,
    id: `${claimId}_${status}_${event.seq}`,
    seq: event.seq,
    sources: [...new Set([...(submitted?.sources ?? []), ...payloadArray(event, "sources")])],
    status,
    taskId: submitted?.taskId ?? eventTaskId(event),
    text: submitted?.text ?? (note || claimId),
    verifierAgent: payloadString(event, "verifierAgent") || event.actor
  };
}

function pendingHandoffItem(handoff: NonNullable<ReturnType<typeof structuredHandoffFromEvent>>, event: DemoEvent): SharedFactBoardItem {
  return {
    agentId: handoff.from,
    confidence: handoff.confidence,
    createdAt: event.createdAt,
    handoffId: handoff.handoffId,
    id: handoff.handoffId ?? `${handoff.taskId}_${handoff.from}_${handoff.recipient}`,
    openQuestions: handoff.openQuestions,
    recipient: handoff.recipient,
    requiredAction: handoff.requiredAction,
    seq: event.seq,
    sources: handoff.sources,
    status: "pending",
    taskId: handoff.taskId,
    text: handoff.summary
  };
}

function missingEvidenceItem(event: DemoEvent): SharedFactBoardItem | null {
  const status = payloadString(event, "status");
  if (status !== "rejected") {
    return null;
  }
  const reasons = payloadArray(event, "reasons");
  const taskId = eventTaskId(event);
  return {
    agentId: eventAgentId(event),
    createdAt: event.createdAt,
    id: `missing_evidence_${event.seq}`,
    seq: event.seq,
    sources: payloadArray(event, "evidenceFiles"),
    status: "rejected",
    taskId,
    text: reasons.length > 0 ? reasons.join("; ") : `Evidence gate rejected${taskId ? ` for ${taskId}` : ""}.`
  };
}

function acceptedConclusionItem(event: DemoEvent): SharedFactBoardItem | null {
  const status = payloadString(event, "status");
  if (!["accepted", "passed", "reviewed"].includes(status)) {
    return null;
  }

  const text = payloadStringAny(event, ["summary", "result", "body", "note"]) || `${event.type} ${status}`;

  return {
    agentId: eventAgentId(event),
    createdAt: event.createdAt,
    id: `accepted_${event.seq}`,
    seq: event.seq,
    sources: payloadArrayAny(event, ["sources", "evidenceFiles", "files"]),
    status: "accepted",
    taskId: eventTaskId(event),
    text
  };
}

function messageType(event: DemoEvent) {
  return payloadStringAny(event, ["messageType", "type"]);
}

function eventSources(event: DemoEvent) {
  return payloadArrayAny(event, ["sources", "evidenceFiles", "files", "touchedFiles", "screenshots"]);
}

function evidenceSubmittedItem(event: DemoEvent): SharedFactBoardItem | null {
  if (event.type !== "evidence.submitted") {
    return null;
  }

  const agentId = eventAgentId(event);
  const summary = payloadStringAny(event, ["summary", "title", "body", "note"]);
  const taskId = eventTaskId(event);

  return {
    agentId,
    createdAt: event.createdAt,
    id: `evidence_${event.seq}`,
    seq: event.seq,
    sources: eventSources(event),
    status: "supported",
    taskId,
    text: `Evidence submitted by ${agentId}: ${summary || taskId || event.type}`
  };
}

function lifecycleDoneItem(event: DemoEvent): SharedFactBoardItem | null {
  if (event.type !== "crew.member.status_changed") {
    return null;
  }

  const status = payloadString(event, "status");
  if (status !== "done") {
    return null;
  }

  const agentId = eventAgentId(event);
  if (!agentId || agentId === "agent_codex") {
    return null;
  }

  return {
    agentId,
    createdAt: event.createdAt,
    id: `lifecycle_done_${agentId}_${event.seq}`,
    seq: event.seq,
    sources: [],
    status: "supported",
    taskId: eventTaskId(event),
    text: `${agentId} reached done state.`
  };
}

function mailboxHandoffItem(event: DemoEvent): SharedFactBoardItem | null {
  if (event.type !== "mailbox.message.sent") {
    return null;
  }

  const from = payloadString(event, "from") || event.actor;
  const to = payloadString(event, "to");
  const body = payloadString(event, "body");
  if (!from || !to || !body || from === "advisor" || to === "advisor") {
    return null;
  }

  const type = messageType(event);
  if (type === "instruction" || type === "intent_confirmed") {
    return null;
  }
  const openQuestions =
    type === "question" || type === "peer_challenge" || body.includes("?") || body.includes("？") ? [body] : [];

  return {
    agentId: from,
    createdAt: event.createdAt,
    handoffId: payloadString(event, "messageId") || event.messageId || `mailbox_${event.seq}`,
    id: payloadString(event, "messageId") || event.messageId || `mailbox_${event.seq}`,
    openQuestions,
    recipient: to,
    requiredAction: `${to} should consume this mailbox message.`,
    seq: event.seq,
    sources: eventSources(event),
    status: "pending",
    taskId: eventTaskId(event) || payloadString(event, "taskId") || "task_unknown",
    text: body
  };
}

function evidenceKey(agentId: string, taskId?: string) {
  return `${agentId}::${taskId ?? ""}`;
}

function missingEvidenceFromDoneEvent(
  event: DemoEvent,
  submittedEvidenceKeys: Set<string>,
  submittedEvidenceAgents: Set<string>
): SharedFactBoardItem | null {
  const done = lifecycleDoneItem(event);
  if (!done) {
    return null;
  }

  if (submittedEvidenceKeys.has(evidenceKey(done.agentId, done.taskId)) || submittedEvidenceAgents.has(done.agentId)) {
    return null;
  }

  return {
    ...done,
    id: `missing_evidence_done_${done.agentId}_${event.seq}`,
    status: "rejected",
    text: `${done.agentId} is done but no evidence.submitted event was found.`
  };
}

export function createSharedFactBoard(input: CreateSharedFactBoardInput): SharedFactBoard {
  const claimSubmissions = new Map<string, SharedFactBoardItem>();
  const claimReviews: SharedFactBoardItem[] = [];
  const evidenceFacts: SharedFactBoardItem[] = [];
  const lifecycleFacts: SharedFactBoardItem[] = [];
  const mailboxHandoffs: SharedFactBoardItem[] = [];
  const missingEvidence: SharedFactBoardItem[] = [];
  const acceptedConclusions: SharedFactBoardItem[] = [];
  const submittedEvidenceAgents = new Set<string>();
  const submittedEvidenceKeys = new Set<string>();

  for (const event of input.events) {
    if (event.type === "claim.submitted") {
      const item = claimItemFromSubmitted(event);
      if (item) {
        claimSubmissions.set(item.claimId ?? item.id, item);
      }
    }

    if (event.type === "claim.reviewed") {
      const claimId = payloadStringAny(event, ["claimId", "claim_id"]);
      const item = reviewItem(event, claimSubmissions.get(claimId));
      if (item) {
        claimReviews.push(item);
      }
    }

    if (event.type === "evidence.gate.checked") {
      const missing = missingEvidenceItem(event);
      if (missing) {
        missingEvidence.push(missing);
      }
    }

    if (event.type === "workflow.acceptance.completed" || event.type === "steerer.review.completed") {
      const accepted = acceptedConclusionItem(event);
      if (accepted) {
        acceptedConclusions.push(accepted);
      }
    }

    if (event.type === "evidence.submitted") {
      const item = evidenceSubmittedItem(event);
      if (item) {
        evidenceFacts.push(item);
        submittedEvidenceAgents.add(item.agentId);
        submittedEvidenceKeys.add(evidenceKey(item.agentId, item.taskId));
      }
    }

    if (event.type === "crew.member.status_changed") {
      const item = lifecycleDoneItem(event);
      if (item) {
        lifecycleFacts.push(item);
      }
    }

    if (event.type === "mailbox.message.sent") {
      const item = mailboxHandoffItem(event);
      if (item) {
        mailboxHandoffs.push(item);
      }
    }
  }

  const supportedClaimIds = new Set(claimReviews.filter((item) => item.status === "supported").map((item) => item.claimId));
  const confirmedFacts = [...claimReviews.filter((item) => item.status === "supported"), ...evidenceFacts, ...lifecycleFacts].sort(
    (a, b) => a.seq - b.seq
  );
  const conflictingClaims = claimReviews.filter((item) => item.status === "refuted" || item.status === "conflicted" || item.status === "needs_human");
  const unverifiedClaims = [...claimSubmissions.values()].filter((item) => !supportedClaimIds.has(item.claimId));
  const doneMissingEvidence = input.events
    .map((event) => missingEvidenceFromDoneEvent(event, submittedEvidenceKeys, submittedEvidenceAgents))
    .filter((item): item is SharedFactBoardItem => item !== null);
  const pendingHandoffIds = new Set(pendingStructuredHandoffs(input.events).map((handoff) => handoff.handoffId));
  const pendingHandoffs = [
    ...input.events
      .filter((event) => event.type === "handoff.submitted")
      .map((event) => {
        const handoff = structuredHandoffFromEvent(event);
        return handoff && pendingHandoffIds.has(handoff.handoffId) ? pendingHandoffItem(handoff, event) : null;
      })
      .filter((item): item is SharedFactBoardItem => item !== null),
    ...mailboxHandoffs
  ].sort((a, b) => a.seq - b.seq);

  return {
    accepted_conclusions: acceptedConclusions,
    confirmed_facts: confirmedFacts,
    conflicting_claims: conflictingClaims,
    created_at: input.createdAt ?? new Date().toISOString(),
    missing_evidence: [...missingEvidence, ...doneMissingEvidence].sort((a, b) => a.seq - b.seq),
    pending_handoffs: pendingHandoffs,
    run_id: eventRunId(input.events, input.runId),
    schema_version: "dragonboat.shared_fact_board.v0",
    unverified_claims: unverifiedClaims
  };
}

function markdownList(items: SharedFactBoardItem[]) {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map((item) => {
      const label = item.claimId ? `claim:${item.claimId}` : item.handoffId ? `handoff:${item.handoffId}` : item.id;
      const task = item.taskId ? ` task:${item.taskId}` : "";
      const sources = item.sources.length > 0 ? ` sources:${item.sources.join(", ")}` : "";
      return `- #${item.seq} [${item.status}] ${label}${task} - ${item.text}${sources}`;
    })
    .join("\n");
}

export function formatSharedFactBoardMarkdown(board: SharedFactBoard) {
  return [
    "# DragonBoat Shared Fact Board",
    "",
    `Run: ${board.run_id}`,
    `Created: ${board.created_at}`,
    "",
    "## Confirmed Facts",
    "",
    markdownList(board.confirmed_facts),
    "",
    "## Unverified Claims",
    "",
    markdownList(board.unverified_claims),
    "",
    "## Conflicting Claims",
    "",
    markdownList(board.conflicting_claims),
    "",
    "## Missing Evidence",
    "",
    markdownList(board.missing_evidence),
    "",
    "## Pending Handoffs",
    "",
    markdownList(board.pending_handoffs),
    "",
    "## Accepted Conclusions",
    "",
    markdownList(board.accepted_conclusions),
    ""
  ].join("\n");
}
