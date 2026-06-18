// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compareBenchmarkSuite, createBenchmarkSuite } from "./benchmarkSuite";
import type { BenchmarkRecord } from "./benchmarkHarness";

function record(partial: Partial<BenchmarkRecord> & Pick<BenchmarkRecord, "benchmark_id" | "mode">): BenchmarkRecord {
  return {
    benchmark_id: partial.benchmark_id,
    blockers: 0,
    date: "2026-05-30T00:00:00.000Z",
    economics_verdict: "inconclusive",
    evidence_count: 1,
    false_done_count: partial.false_done_count ?? 0,
    first_pass_acceptance: partial.first_pass_acceptance ?? true,
    mailbox_count: 1,
    mode: partial.mode,
    outcome: partial.outcome ?? "pass",
    premium_token_ratio: partial.premium_token_ratio ?? 1,
    rower_count: partial.rower_count ?? 0,
    run_id: partial.run_id ?? partial.benchmark_id,
    task_class: partial.task_class ?? "audit",
    task_name: partial.task_name ?? "Audit",
    total_tokens: partial.total_tokens ?? 1000,
    wall_clock_seconds: partial.wall_clock_seconds ?? 100,
    workspace_root: "/tmp/project",
    workspace_sync_failures: 0
  };
}

describe("agent team benchmark suite", () => {
  it("compares single, team, and workflow modes with confidence and recommendation", () => {
    const suite = createBenchmarkSuite({
      id: "suite_agentic_modes",
      records: [
        record({ benchmark_id: "single", mode: "single_agent", premium_token_ratio: 1, wall_clock_seconds: 600 }),
        record({ benchmark_id: "team", mode: "agent_team", premium_token_ratio: 0.55, wall_clock_seconds: 420 }),
        record({ benchmark_id: "workflow", mode: "dynamic_workflow", premium_token_ratio: 0.35, wall_clock_seconds: 300 })
      ],
      taskName: "Ledger audit"
    });
    const comparison = compareBenchmarkSuite(suite);

    expect(comparison.modesCompared).toEqual(["single_agent", "agent_team", "dynamic_workflow"]);
    expect(comparison.recommendedMode).toBe("dynamic_workflow");
    expect(comparison.confidence).toBe("high");
    expect(comparison.reason).toContain("lower premium token ratio");
  });

  it("lowers confidence when token data is missing or outcomes are partial", () => {
    const suite = createBenchmarkSuite({
      id: "suite_incomplete",
      records: [
        record({ benchmark_id: "single", mode: "single_agent", outcome: "partial", premium_token_ratio: 0, total_tokens: 0 }),
        record({ benchmark_id: "team", mode: "agent_team", outcome: "partial", premium_token_ratio: 0, total_tokens: 0 })
      ],
      taskName: "Incomplete run"
    });

    expect(compareBenchmarkSuite(suite)).toMatchObject({
      confidence: "low",
      recommendedMode: "inconclusive"
    });
  });
});
