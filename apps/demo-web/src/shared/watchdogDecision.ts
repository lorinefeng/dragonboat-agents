import type { DemoEvent } from "./types";

export interface WatchdogState {
  consecutiveContinuationCount: number;
  lastContinuationTargetSeq: number;
  lastContinuationTurnId: string;
  lastPendingSignature: string;
  lastReviewedSeq: number;
}

export interface CodexStopHookInput {
  cwd?: string;
  hook_event_name?: string;
  last_assistant_message?: string;
  model?: string;
  permission_mode?: string;
  session_id?: string;
  stop_hook_active?: boolean;
  turn_id?: string;
}

export interface RelevantPendingEvent {
  description: string;
  event: DemoEvent;
  kind: string;
}

export interface WatchdogDecisionResult {
  pendingFromSeq: number;
  pendingKinds: string[];
  pendingSignature: string;
  pendingToSeq: number;
  reason: string;
  shouldContinue: boolean;
}

const RELEVANT_AGENT_STATUSES = new Set(["done", "blocked", "stopped"]);
const MAX_CONSECUTIVE_CONTINUATIONS = 2;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function mailboxType(event: DemoEvent) {
  return asString(event.payload?.messageType) || asString(event.payload?.type);
}

function collectRelevantEvents(events: DemoEvent[], afterSeq: number): RelevantPendingEvent[] {
  const pending: RelevantPendingEvent[] = [];

  for (const event of events) {
    if (event.seq <= afterSeq) {
      continue;
    }

    if (event.type === "mailbox.message.sent") {
      const to = asString(event.payload?.to);
      const messageType = mailboxType(event);

      if (to === "agent_codex") {
        pending.push({
          description: `Mailbox to agent_codex: ${messageType}`,
          event,
          kind: "mailbox"
        });
      } else if (messageType === "blocker") {
        pending.push({
          description: `Blocker mailbox from ${asString(event.payload?.from)} to ${to}`,
          event,
          kind: "mailbox"
        });
      }
    }

    if (event.type === "evidence.submitted" && event.actor !== "agent_codex") {
      pending.push({
        description: `Evidence from ${event.actor}`,
        event,
        kind: "evidence"
      });
    }

    if (event.type === "crew.member.status_changed") {
      const agentId = asString(event.payload?.agentId);
      const status = asString(event.payload?.status);

      if (agentId !== "agent_codex" && RELEVANT_AGENT_STATUSES.has(status)) {
        pending.push({
          description: `${agentId} status: ${status}`,
          event,
          kind: "rower_lifecycle"
        });
      }
    }
  }

  return pending;
}

function buildPendingSignature(pending: RelevantPendingEvent[]) {
  const kindCounts = new Map<string, number>();
  const actors = new Set<string>();

  for (const item of pending) {
    kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);
    if (item.event.actor) {
      actors.add(item.event.actor);
    }
  }

  const toSeq = pending.length > 0 ? Math.max(...pending.map((item) => item.event.seq)) : 0;
  const kinds = [...kindCounts.entries()]
    .sort()
    .map(([kind, count]) => `${kind}:${count}`)
    .join(",");
  const actorList = [...actors].sort().join(",");

  return `${toSeq}|${kinds}|${actorList}`;
}

function buildContinuationReason(pending: RelevantPendingEvent[], runId: string, fromSeq: number) {
  const summaries = pending.map((item) => item.description);
  const focus = summaries.length > 3 ? `${summaries.slice(0, 3).join("; ")}; and ${summaries.length - 3} more` : summaries.join("; ");

  return `DragonBoat watchdog: new rower events need steerer review before stopping. Review pending mailbox/evidence/lifecycle items for run ${runId} since seq ${fromSeq}. Focus on: ${focus}`;
}

export function decideWatchdogAction(
  hookInput: CodexStopHookInput,
  events: DemoEvent[],
  state: WatchdogState,
  runId: string
): WatchdogDecisionResult {
  let effectiveLastReviewedSeq = state.lastReviewedSeq;

  if (hookInput.stop_hook_active && state.lastContinuationTargetSeq > state.lastReviewedSeq) {
    effectiveLastReviewedSeq = state.lastContinuationTargetSeq;
  }

  const pending = collectRelevantEvents(events, effectiveLastReviewedSeq);

  if (pending.length === 0) {
    return {
      pendingFromSeq: 0,
      pendingKinds: [],
      pendingSignature: "",
      pendingToSeq: 0,
      reason: "",
      shouldContinue: false
    };
  }

  const pendingFromSeq = Math.min(...pending.map((item) => item.event.seq));
  const pendingToSeq = Math.max(...pending.map((item) => item.event.seq));
  const pendingKinds = [...new Set(pending.map((item) => item.kind))].sort();
  const pendingSignature = buildPendingSignature(pending);

  if (hookInput.stop_hook_active) {
    if (pendingSignature === state.lastPendingSignature && pendingToSeq <= state.lastContinuationTargetSeq) {
      return {
        pendingFromSeq,
        pendingKinds,
        pendingSignature,
        pendingToSeq,
        reason: "",
        shouldContinue: false
      };
    }

    if (state.consecutiveContinuationCount >= MAX_CONSECUTIVE_CONTINUATIONS && pendingToSeq <= state.lastContinuationTargetSeq) {
      return {
        pendingFromSeq,
        pendingKinds,
        pendingSignature,
        pendingToSeq,
        reason: "",
        shouldContinue: false
      };
    }
  }

  return {
    pendingFromSeq,
    pendingKinds,
    pendingSignature,
    pendingToSeq,
    reason: buildContinuationReason(pending, runId, pendingFromSeq),
    shouldContinue: true
  };
}

export function advanceStateAfterDecision(
  state: WatchdogState,
  decision: WatchdogDecisionResult,
  hookInput: CodexStopHookInput
): WatchdogState {
  if (!decision.shouldContinue) {
    if (hookInput.stop_hook_active && state.lastContinuationTargetSeq > state.lastReviewedSeq) {
      return {
        ...state,
        consecutiveContinuationCount: 0,
        lastReviewedSeq: state.lastContinuationTargetSeq
      };
    }

    return state;
  }

  return {
    consecutiveContinuationCount: state.consecutiveContinuationCount + 1,
    lastContinuationTargetSeq: decision.pendingToSeq,
    lastContinuationTurnId: hookInput.turn_id ?? "",
    lastPendingSignature: decision.pendingSignature,
    lastReviewedSeq: state.lastReviewedSeq
  };
}
