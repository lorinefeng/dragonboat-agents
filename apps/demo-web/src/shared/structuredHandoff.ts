import type { DemoEvent, HandoffAckStatus, HandoffConfidence, StructuredHandoffInput } from "./types";

export const HANDOFF_ACK_STATUSES: HandoffAckStatus[] = ["read", "consumed", "question"];
export const HANDOFF_CONFIDENCE_VALUES: HandoffConfidence[] = ["low", "medium", "high"];

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
    const value = payloadArray(event, key);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

function payloadBoolean(event: DemoEvent, key: string) {
  return event.payload?.[key] === true;
}

function payloadBooleanAny(event: DemoEvent, keys: string[]) {
  return keys.some((key) => payloadBoolean(event, key));
}

export function normalizeHandoffConfidence(value: string): HandoffConfidence {
  if (HANDOFF_CONFIDENCE_VALUES.includes(value as HandoffConfidence)) {
    return value as HandoffConfidence;
  }

  throw new Error("Handoff confidence must be low, medium, or high.");
}

export function normalizeHandoffAckStatus(value: string): HandoffAckStatus {
  if (HANDOFF_ACK_STATUSES.includes(value as HandoffAckStatus)) {
    return value as HandoffAckStatus;
  }

  throw new Error("Handoff ack --status must be read, consumed, or question.");
}

export function createHandoffId(input: Pick<StructuredHandoffInput, "from" | "recipient" | "taskId">) {
  const source = `${input.taskId}_${input.from}_to_${input.recipient}`;
  return `handoff_${source.replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

export function structuredHandoffFromEvent(event: DemoEvent): StructuredHandoffInput | null {
  if (event.type !== "handoff.submitted") {
    return null;
  }

  const from = payloadString(event, "from") || event.actor;
  const recipient = payloadString(event, "recipient") || payloadString(event, "to");
  const taskId = event.taskId ?? payloadString(event, "taskId");
  const summary = payloadString(event, "summary");
  const requiredAction = payloadStringAny(event, ["requiredAction", "required_action"]);
  const confidence = payloadString(event, "confidence");
  const handoffId = payloadString(event, "handoffId") || createHandoffId({ from, recipient, taskId });

  if (!from || !recipient || !taskId || !summary || !requiredAction || !confidence) {
    return null;
  }

  return {
    ackRequired: payloadBooleanAny(event, ["ackRequired", "ack_required"]),
    artifactPath: payloadStringAny(event, ["artifactPath", "artifact_path"]) || undefined,
    body: payloadString(event, "body") || undefined,
    claims: payloadArray(event, "claims"),
    confidence: normalizeHandoffConfidence(confidence),
    from,
    handoffId,
    openQuestions: payloadArrayAny(event, ["openQuestions", "open_questions"]),
    recipient,
    requiredAction,
    sources: payloadArray(event, "sources"),
    summary,
    taskId
  };
}

export function handoffAckStatus(events: DemoEvent[], handoffId: string, beforeSeq = Number.POSITIVE_INFINITY) {
  return events
    .filter((event) => event.type === "handoff.acknowledged" && event.seq < beforeSeq && payloadString(event, "handoffId") === handoffId)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
}

export function pendingStructuredHandoffs(events: DemoEvent[]) {
  const handoffs = events.map(structuredHandoffFromEvent).filter((handoff): handoff is StructuredHandoffInput => handoff !== null);

  return handoffs.filter((handoff) => {
    if (!handoff.ackRequired || !handoff.handoffId) {
      return false;
    }
    return !handoffAckStatus(events, handoff.handoffId);
  });
}
