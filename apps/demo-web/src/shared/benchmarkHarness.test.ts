// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compareBenchmarkRecords, createBenchmarkRecord } from "./benchmarkHarness";
import type { DemoEvent } from "./types";

function event(seq: number, type: string, actor: string, payload: Record<string, unknown> = {}): DemoEvent {
  return {
    actor,
    createdAt: `2026-05-26T00:00:${String(seq).padStart(2, "0")}Z`,
    id: `evt_${seq}`,
    payload,
    runId: "run_benchmark",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type: type as DemoEvent["type"]
  };
}

function eventAt(
  seq: number,
  createdAt: string,
  type: DemoEvent["type"],
  actor: string,
  payload: Record<string, unknown> = {}
): DemoEvent {
  return {
    actor,
    createdAt,
    id: `evt_${seq}`,
    payload,
    runId: "run_benchmark",
    seq,
    taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
    type
  };
}

describe("benchmark harness", () => {
  it("derives crew coordination metrics from a run event ledger", () => {
    const record = createBenchmarkRecord({
      benchmarkId: "bench_crew",
      date: "2026-05-26T00:01:00Z",
      events: [
        event(1, "run.created", "agent_codex"),
        event(2, "delegation.fit.assessed", "agent_codex", {
          decision: "crew_strong_fit",
          fit_score: 12
        }),
        event(3, "crew.member.registered", "agent_backend", {
          agentId: "agent_backend",
          platform: "claude_code_cli"
        }),
        event(4, "mailbox.message.sent", "agent_backend", {
          body: "contract",
          from: "agent_backend",
          to: "agent_frontend"
        }),
        event(5, "evidence.submitted", "agent_backend", {
          taskId: "task_backend"
        }),
        event(6, "crew.member.status_changed", "agent_codex", {
          agentId: "agent_backend",
          status: "stopped"
        })
      ],
      mode: "crew",
      taskClass: "backend_contract",
      taskName: "Mailbox expectation tracker",
      workspaceRoot: "/repo"
    });

    expect(record.rower_count).toBe(1);
    expect(record.mailbox_count).toBe(1);
    expect(record.evidence_count).toBe(1);
    expect(record.fit_score).toBe(12);
    expect(record.outcome).toBe("partial");
  });

  it("derives native team efficiency metrics from rower command telemetry and self estimates", () => {
    const record = createBenchmarkRecord({
      benchmarkId: "bench_team_hard_metrics",
      date: "2026-06-02T08:00:00Z",
      events: [
        eventAt(1, "2026-06-02T07:07:20.000Z", "run.created", "agent_codex"),
        eventAt(2, "2026-06-02T07:07:20.000Z", "crew.member.registered", "agent_a", {
          agentId: "agent_a",
          platform: "claude_code_cli"
        }),
        eventAt(3, "2026-06-02T07:07:30.000Z", "crew.member.registered", "agent_b", {
          agentId: "agent_b",
          platform: "claude_code_cli"
        }),
        eventAt(4, "2026-06-02T07:07:20.000Z", "command.started", "agent_a", {
          agentId: "agent_a"
        }),
        eventAt(5, "2026-06-02T07:07:30.000Z", "command.started", "agent_b", {
          agentId: "agent_b"
        }),
        eventAt(6, "2026-06-02T07:12:20.000Z", "command.finished", "agent_a", {
          agentId: "agent_a",
          exitCode: 0
        }),
        eventAt(7, "2026-06-02T07:17:20.000Z", "command.finished", "agent_b", {
          agentId: "agent_b",
          exitCode: 0
        }),
        eventAt(8, "2026-06-02T07:17:30.000Z", "evidence.submitted", "agent_a", {
          estimatedSoloMinutes: 40,
          taskId: "task_a"
        }),
        eventAt(9, "2026-06-02T07:17:40.000Z", "evidence.submitted", "agent_b", {
          rower_self_estimate_minutes: 50,
          taskId: "task_b"
        })
      ],
      mode: "agent_team",
      taskClass: "repo_capability_map",
      taskName: "Repository capability map",
      workspaceRoot: "/repo"
    });

    expect(record.team_wall_clock_seconds).toBe(600);
    expect(record.wall_clock_seconds).toBe(600);
    expect(record.serial_lower_bound_seconds).toBe(890);
    expect(record.hard_telemetry_seconds).toBe(600);
    expect(record.rower_self_estimate_seconds).toBe(5400);
    expect(record.soft_estimate_seconds).toBe(5400);
    expect(record.confidence_level).toBe("high");
  });

  it("derives soft estimates from rower handoff and evidence artifact text", () => {
    const record = createBenchmarkRecord({
      artifactTexts: [
        [
          "# Evidence: agent_root_mainline_map",
          "",
          "## Time Metrics",
          "",
          "- Elapsed Minutes: 45",
          "- Estimated Solo Minutes: 90",
          "- Single-Agent Reread Penalty Minutes: 30"
        ].join("\n"),
        [
          "# agent_evidence_value_crosscheck",
          "",
          "| Elapsed Minutes | ~20 |",
          "| Estimated Solo Minutes | ~55 |",
          "| Single-Agent Reread Penalty Minutes | ~15 |"
        ].join("\n")
      ],
      benchmarkId: "bench_team_artifact_metrics",
      events: [
        eventAt(1, "2026-06-02T07:00:00.000Z", "command.started", "agent_root_mainline_map", {
          agentId: "agent_root_mainline_map"
        }),
        eventAt(2, "2026-06-02T07:10:00.000Z", "command.finished", "agent_root_mainline_map", {
          agentId: "agent_root_mainline_map",
          exitCode: 0
        })
      ],
      mode: "agent_team",
      taskClass: "repo_capability_map",
      taskName: "Repository capability map",
      workspaceRoot: "/repo"
    });

    expect(record.rower_self_estimate_seconds).toBe(8700);
    expect(record.soft_estimate_seconds).toBe(11400);
  });

  it("compares solo and crew records by acceptance, premium ratio, and elapsed time", () => {
    const solo = createBenchmarkRecord({
      benchmarkId: "bench_solo",
      date: "2026-05-26T00:01:00Z",
      events: [],
      mode: "single_agent",
      taskClass: "backend_contract",
      taskName: "Mailbox expectation tracker",
      tokenMetrics: {
        premium_input_tokens: 1000,
        premium_output_tokens: 500,
        low_cost_input_tokens: 0,
        low_cost_output_tokens: 0
      },
      timing: {
        wall_clock_seconds: 100
      },
      workspaceRoot: "/repo"
    });
    const crew = createBenchmarkRecord({
      benchmarkId: "bench_crew",
      date: "2026-05-26T00:01:00Z",
      events: [],
      mode: "crew",
      taskClass: "backend_contract",
      taskName: "Mailbox expectation tracker",
      tokenMetrics: {
        premium_input_tokens: 300,
        premium_output_tokens: 150,
        low_cost_input_tokens: 700,
        low_cost_output_tokens: 300
      },
      timing: {
        wall_clock_seconds: 80
      },
      workspaceRoot: "/repo"
    });

    expect(compareBenchmarkRecords(solo, crew).economics_verdict).toBe("crew_better");
  });

  it("records dynamic workflow mode without collapsing it into generic crew", () => {
    const record = createBenchmarkRecord({
      benchmarkId: "bench_workflow",
      events: [
        event(1, "workflow.plan.created", "agent_codex", {
          workflowId: "workflow_audit"
        }),
        event(2, "workflow.phase.started", "workflow_supervisor", {
          phaseId: "phase_cross_check"
        }),
        event(3, "claim.reviewed", "agent_refuter", {
          status: "supported"
        })
      ],
      mode: "dynamic_workflow",
      taskClass: "audit",
      taskName: "Claim ledger audit",
      workspaceRoot: "/repo"
    });

    expect(record.mode).toBe("dynamic_workflow");
    expect(record.premium_token_ratio).toBe(0);
  });
});
