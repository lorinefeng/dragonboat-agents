import type { DemoEvent } from "./types";

export type SupervisionExpectation = "evidence" | "intent_confirmed" | "status";
export type CrewSupervisionStatus = "blocked" | "complete" | "waiting";

export interface AgentSupervisionReport {
  blocked: boolean;
  complete: boolean;
  met: SupervisionExpectation[];
  missing: SupervisionExpectation[];
}

export interface CrewSupervisionReport {
  agents: Record<string, AgentSupervisionReport>;
  complete: boolean;
  expectations: SupervisionExpectation[];
  status: CrewSupervisionStatus;
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function eventAgent(event: DemoEvent) {
  const record = event as DemoEvent & { agentId?: string };
  return record.actor ?? record.agentId ?? payloadString(event, "agentId") ?? payloadString(event, "from");
}

function eventMessageType(event: DemoEvent) {
  return payloadString(event, "messageType") || payloadString(event, "type");
}

function messageFrom(event: DemoEvent) {
  return payloadString(event, "from") || eventAgent(event);
}

function hasMailbox(events: DemoEvent[], agentId: string, types: string[]) {
  return events.some((event) => event.type === "mailbox.message.sent" && messageFrom(event) === agentId && types.includes(eventMessageType(event)));
}

function hasEvidence(events: DemoEvent[], agentId: string) {
  return events.some((event) => event.type === "evidence.submitted" && eventAgent(event) === agentId);
}

function hasBlocked(events: DemoEvent[], agentId: string) {
  return (
    hasMailbox(events, agentId, ["blocker"]) ||
    events.some(
      (event) =>
        event.type === "crew.member.status_changed" &&
        eventAgent(event) === agentId &&
        (payloadString(event, "status") === "blocked" || payloadString(event, "nextStatus") === "blocked")
    )
  );
}

function expectationMet(events: DemoEvent[], agentId: string, expectation: SupervisionExpectation) {
  if (expectation === "intent_confirmed") {
    return hasMailbox(events, agentId, ["intent_confirmed"]);
  }

  if (expectation === "status") {
    return hasMailbox(events, agentId, ["status", "review", "worklog"]);
  }

  return hasEvidence(events, agentId);
}

export function evaluateCrewSupervision(input: {
  agents: string[];
  events: DemoEvent[];
  expectations: SupervisionExpectation[];
}): CrewSupervisionReport {
  const agents: Record<string, AgentSupervisionReport> = {};

  for (const agentId of input.agents) {
    const met = input.expectations.filter((expectation) => expectationMet(input.events, agentId, expectation));
    const missing = input.expectations.filter((expectation) => !met.includes(expectation));
    const blocked = hasBlocked(input.events, agentId);

    agents[agentId] = {
      blocked,
      complete: !blocked && missing.length === 0,
      met,
      missing
    };
  }

  const values = Object.values(agents);
  const blocked = values.some((agent) => agent.blocked);
  const complete = values.length > 0 && values.every((agent) => agent.complete);

  return {
    agents,
    complete,
    expectations: input.expectations,
    status: blocked ? "blocked" : complete ? "complete" : "waiting"
  };
}

export function formatCrewSupervisionReport(report: CrewSupervisionReport) {
  const lines = [`supervision ${report.status}`];

  for (const [agentId, agent] of Object.entries(report.agents)) {
    const marker = agent.complete ? "✓" : agent.blocked ? "!" : "…";
    const met = agent.met.length > 0 ? agent.met.join(", ") : "none";
    const missing = agent.missing.length > 0 ? agent.missing.join(", ") : "none";
    lines.push(`${marker} ${agentId} met: ${met}; missing: ${missing}`);
  }

  return `${lines.join("\n")}\n`;
}
