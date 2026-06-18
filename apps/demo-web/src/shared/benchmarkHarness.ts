import type { DemoEvent } from "./types";

export type BenchmarkMode = "agent_team" | "crew" | "dynamic_workflow" | "single_agent";
export type BenchmarkOutcome = "fail" | "partial" | "pass";
export type EconomicsVerdict = "crew_better" | "inconclusive" | "solo_better";
export type BenchmarkConfidenceLevel = "high" | "low" | "medium";

export interface BenchmarkRecord {
  benchmark_id: string;
  blockers: number;
  date: string;
  economics_verdict: EconomicsVerdict;
  evidence_count: number;
  false_done_count: number;
  first_pass_acceptance: boolean;
  fit_score?: number;
  confidence_level?: BenchmarkConfidenceLevel;
  hard_telemetry_seconds?: number;
  mailbox_count: number;
  mode: BenchmarkMode;
  outcome: BenchmarkOutcome;
  premium_token_ratio: number;
  rower_count: number;
  rower_self_estimate_seconds?: number;
  run_id: string;
  serial_lower_bound_seconds?: number;
  soft_estimate_seconds?: number;
  task_class: string;
  task_name: string;
  team_wall_clock_seconds?: number;
  total_tokens: number;
  wall_clock_seconds: number;
  workspace_root: string;
  workspace_sync_failures: number;
}

export interface BenchmarkRecordInput {
  artifactTexts?: string[];
  benchmarkId: string;
  date?: string;
  events: DemoEvent[];
  gitSha?: string;
  mode: BenchmarkMode;
  taskClass: string;
  taskName: string;
  timing?: {
    wall_clock_seconds?: number;
  };
  tokenMetrics?: {
    low_cost_input_tokens?: number;
    low_cost_output_tokens?: number;
    premium_input_tokens?: number;
    premium_output_tokens?: number;
  };
  workspaceRoot: string;
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function payloadNumber(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "number" ? value : undefined;
}

function eventTime(event: DemoEvent) {
  const time = new Date(event.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function eventAgentId(event: DemoEvent) {
  return payloadString(event, "agentId") || event.actor;
}

function elapsedSeconds(events: DemoEvent[]) {
  if (events.length < 2) {
    return 0;
  }
  const times = events.map(eventTime).filter((time) => time > 0);
  if (times.length < 2) {
    return 0;
  }
  return Math.max(0, Math.round((Math.max(...times) - Math.min(...times)) / 1000));
}

interface RowerTimingMetrics {
  confidenceLevel: BenchmarkConfidenceLevel;
  serialLowerBoundSeconds: number;
  teamWallClockSeconds: number;
}

function deriveRowerTimingMetrics(events: DemoEvent[], fallbackWallClockSeconds: number): RowerTimingMetrics {
  const starts = new Map<string, number>();
  const intervals: Array<{ agentId: string; end: number; start: number }> = [];

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const agentId = eventAgentId(event);
    if (!agentId || agentId === "agent_codex") {
      continue;
    }

    if (event.type === "command.started") {
      const startedAt = eventTime(event);
      if (startedAt > 0 && !starts.has(agentId)) {
        starts.set(agentId, startedAt);
      }
    }

    if (event.type === "command.finished") {
      const finishedAt = eventTime(event);
      const startedAt = starts.get(agentId);
      if (startedAt && finishedAt > startedAt) {
        intervals.push({
          agentId,
          end: finishedAt,
          start: startedAt
        });
      }
    }
  }

  if (intervals.length === 0) {
    return {
      confidenceLevel: fallbackWallClockSeconds > 0 ? "medium" : "low",
      serialLowerBoundSeconds: 0,
      teamWallClockSeconds: fallbackWallClockSeconds
    };
  }

  const teamStart = Math.min(...intervals.map((interval) => interval.start));
  const teamEnd = Math.max(...intervals.map((interval) => interval.end));
  const serialLowerBoundSeconds = intervals.reduce((sum, interval) => sum + Math.round((interval.end - interval.start) / 1000), 0);

  return {
    confidenceLevel: "high",
    serialLowerBoundSeconds,
    teamWallClockSeconds: Math.max(0, Math.round((teamEnd - teamStart) / 1000))
  };
}

function payloadNumberAny(event: DemoEvent, keys: string[]) {
  for (const key of keys) {
    const value = payloadNumber(event, key);
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownMetricMinutes(text: string, labels: string[]) {
  const alternatives = labels.map(escapeRegex).join("|");
  const pattern = new RegExp(`(?:^|[|\\-\\*\\s])\\s*(?:${alternatives})\\s*(?:\\||:|-)?\\s*~?\\s*([0-9]+(?:\\.[0-9]+)?)`, "gim");
  let total = 0;
  for (const match of text.matchAll(pattern)) {
    const minutes = Number(match[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      total += minutes;
    }
  }
  return Math.round(total * 60);
}

function deriveArtifactEstimateSeconds(artifactTexts: string[] | undefined, labels: string[]) {
  return (artifactTexts ?? []).reduce((sum, text) => sum + markdownMetricMinutes(text, labels), 0);
}

function deriveRowerSelfEstimateSeconds(events: DemoEvent[]) {
  return events.reduce((sum, event) => {
    const minutes = payloadNumberAny(event, [
      "estimatedSoloMinutes",
      "estimated_solo_minutes",
      "rowerSelfEstimateMinutes",
      "rower_self_estimate_minutes",
      "singleAgentEstimateMinutes",
      "single_agent_estimate_minutes",
      "soloEstimateMinutes",
      "solo_estimate_minutes"
    ]);
    return sum + (typeof minutes === "number" && minutes > 0 ? Math.round(minutes * 60) : 0);
  }, 0);
}

function deriveRereadPenaltySeconds(events: DemoEvent[]) {
  return events.reduce((sum, event) => {
    const minutes = payloadNumberAny(event, [
      "rereadPenaltyMinutes",
      "reread_penalty_minutes",
      "singleAgentRereadPenaltyMinutes",
      "single_agent_reread_penalty_minutes",
      "single_agent_reread_penalty"
    ]);
    return sum + (typeof minutes === "number" && minutes > 0 ? Math.round(minutes * 60) : 0);
  }, 0);
}

function deriveOutcome(events: DemoEvent[]): BenchmarkOutcome {
  if (
    events.some(
      (event) =>
        (event.type === "evidence.gate.checked" && payloadString(event, "status") === "reviewable") ||
        (event.type === "workflow.acceptance.completed" && ["accepted", "passed"].includes(payloadString(event, "status"))) ||
        (event.type === "steerer.review.completed" && ["accepted", "passed", "reviewed"].includes(payloadString(event, "status")))
    )
  ) {
    return "pass";
  }

  if (
    events.some(
      (event) =>
        (event.type === "evidence.gate.checked" && payloadString(event, "status") === "rejected") ||
        (event.type === "mailbox.message.sent" && (payloadString(event, "messageType") || payloadString(event, "type")) === "blocker") ||
        (event.type === "crew.member.status_changed" && payloadString(event, "status") === "blocked")
    )
  ) {
    return "fail";
  }

  return "partial";
}

export function createBenchmarkRecord(input: BenchmarkRecordInput): BenchmarkRecord {
  const rowers = new Set(
    input.events
      .filter((event) => event.type === "crew.member.registered" && payloadString(event, "platform") === "claude_code_cli")
      .map((event) => payloadString(event, "agentId") || event.actor)
  );
  const premiumTokens =
    (input.tokenMetrics?.premium_input_tokens ?? 0) + (input.tokenMetrics?.premium_output_tokens ?? 0);
  const lowCostTokens =
    (input.tokenMetrics?.low_cost_input_tokens ?? 0) + (input.tokenMetrics?.low_cost_output_tokens ?? 0);
  const totalTokens = premiumTokens + lowCostTokens;
  const fitEvent = input.events.find((event) => event.type === "delegation.fit.assessed");
  const outcome = deriveOutcome(input.events);
  const fallbackWallClockSeconds = input.timing?.wall_clock_seconds ?? elapsedSeconds(input.events);
  const timingMetrics = deriveRowerTimingMetrics(input.events, fallbackWallClockSeconds);
  const rowerSelfEstimateSeconds =
    deriveRowerSelfEstimateSeconds(input.events) +
    deriveArtifactEstimateSeconds(input.artifactTexts, [
      "Estimated Solo Minutes",
      "estimated_solo_minutes",
      "estimatedSoloMinutes",
      "Rower Self Estimate Minutes",
      "rower_self_estimate_minutes"
    ]);
  const rereadPenaltySeconds =
    deriveRereadPenaltySeconds(input.events) +
    deriveArtifactEstimateSeconds(input.artifactTexts, [
      "Single-Agent Reread Penalty Minutes",
      "Single Agent Reread Penalty Minutes",
      "Reread Penalty Minutes",
      "reread_penalty_minutes"
    ]);
  const teamWallClockSeconds = timingMetrics.teamWallClockSeconds || fallbackWallClockSeconds;

  return {
    benchmark_id: input.benchmarkId,
    blockers: input.events.filter(
      (event) =>
        (event.type === "mailbox.message.sent" && (payloadString(event, "messageType") || payloadString(event, "type")) === "blocker") ||
        (event.type === "crew.member.status_changed" && payloadString(event, "status") === "blocked")
    ).length,
    confidence_level: timingMetrics.confidenceLevel,
    date: input.date ?? new Date().toISOString(),
    economics_verdict: "inconclusive",
    evidence_count: input.events.filter((event) => event.type === "evidence.submitted").length,
    false_done_count: input.events.filter(
      (event) => event.type === "evidence.gate.checked" && payloadString(event, "status") === "rejected"
    ).length,
    hard_telemetry_seconds: teamWallClockSeconds,
    first_pass_acceptance: outcome === "pass",
    ...(fitEvent && typeof payloadNumber(fitEvent, "fit_score") === "number" ? { fit_score: payloadNumber(fitEvent, "fit_score") } : {}),
    mailbox_count: input.events.filter((event) => event.type === "mailbox.message.sent").length,
    mode: input.mode,
    outcome,
    premium_token_ratio: totalTokens > 0 ? premiumTokens / totalTokens : input.mode === "single_agent" ? 1 : 0,
    rower_count: rowers.size,
    rower_self_estimate_seconds: rowerSelfEstimateSeconds,
    run_id: input.events[0]?.runId ?? "run_unknown",
    serial_lower_bound_seconds: timingMetrics.serialLowerBoundSeconds,
    soft_estimate_seconds: rowerSelfEstimateSeconds + rereadPenaltySeconds,
    task_class: input.taskClass,
    task_name: input.taskName,
    team_wall_clock_seconds: teamWallClockSeconds,
    total_tokens: totalTokens,
    wall_clock_seconds: teamWallClockSeconds,
    workspace_root: input.workspaceRoot,
    workspace_sync_failures: input.events.filter((event) => payloadString(event, "reason").includes("workspace sync")).length
  };
}

export function compareBenchmarkRecords(solo: BenchmarkRecord, crew: BenchmarkRecord) {
  let economics_verdict: EconomicsVerdict = "inconclusive";

  if (crew.outcome === "fail" && solo.outcome !== "fail") {
    economics_verdict = "solo_better";
  } else if (
    crew.premium_token_ratio < solo.premium_token_ratio &&
    (crew.wall_clock_seconds === 0 || solo.wall_clock_seconds === 0 || crew.wall_clock_seconds <= solo.wall_clock_seconds) &&
    crew.false_done_count <= solo.false_done_count
  ) {
    economics_verdict = "crew_better";
  } else if (solo.premium_token_ratio <= crew.premium_token_ratio && solo.wall_clock_seconds <= crew.wall_clock_seconds) {
    economics_verdict = "solo_better";
  }

  return {
    crew: crew.benchmark_id,
    economics_verdict,
    premium_token_ratio_delta: crew.premium_token_ratio - solo.premium_token_ratio,
    solo: solo.benchmark_id,
    wall_clock_delta_seconds: crew.wall_clock_seconds - solo.wall_clock_seconds
  };
}
