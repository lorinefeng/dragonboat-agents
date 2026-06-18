// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSubscriptionAdvisorReport } from "./subscriptionAdvisor";

describe("subscription advisor", () => {
  it("suggests shifting low-value premium spend to local workers when traces show waste", () => {
    const report = createSubscriptionAdvisorReport({
      benchmarkRecords: [
        {
          benchmark_id: "bench_1",
          blockers: 0,
          date: "2026-05-30T00:00:00Z",
          economics_verdict: "inconclusive",
          evidence_count: 1,
          false_done_count: 0,
          first_pass_acceptance: true,
          mailbox_count: 1,
          mode: "dynamic_workflow",
          outcome: "pass",
          premium_token_ratio: 0.8,
          rower_count: 2,
          run_id: "run_subscription",
          task_class: "workflow",
          task_name: "Audit",
          total_tokens: 10000,
          wall_clock_seconds: 100,
          workspace_root: "/repo",
          workspace_sync_failures: 0
        }
      ],
      capabilityMatrix: {
        agents: {},
        models: {
          "local-qwen-coder": {
            attempts: 4,
            capabilities: ["local_llm", "text"],
            failureCount: 0,
            successCount: 4,
            successRate: 1
          }
        }
      },
      costTrace: {
        flamegraph: { children: [], costUsd: 10, name: "workflow", tokens: 10000 },
        totalEstimatedCostUsd: 10,
        totalTokens: 10000,
        wastedEstimatedCostUsd: 4,
        wasteItems: []
      },
      subscriptions: [
        {
          capabilities: ["premium_reasoning"],
          id: "gpt_pro",
          monthlyPriceUsd: 200,
          provider: "openai",
          status: "healthy",
          usageShare: 0.7
        }
      ]
    });

    expect(report.recommendations.map((item) => item.action)).toContain("shift_to_local");
    expect(report.summary).toContain("Premium spend");
  });
});
