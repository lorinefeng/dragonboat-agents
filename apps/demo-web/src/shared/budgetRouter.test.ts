// @vitest-environment node
import { describe, expect, it } from "vitest";
import { selectBudgetAwareRoute } from "./budgetRouter";

describe("budget-aware router", () => {
  it("routes by capability, subscription health, remaining budget, concurrency, and quality risk", () => {
    const decision = selectBudgetAwareRoute({
      candidates: [
        {
          capabilities: ["text"],
          estimatedQualityRisk: 0.35,
          model: "glm-5.1",
          pricePer1kInput: 0.001,
          pricePer1kOutput: 0.002,
          provider: "zai",
          subscriptionId: "zai_api"
        },
        {
          capabilities: ["text", "vision", "browser_research"],
          estimatedQualityRisk: 0.12,
          model: "kimi-k2.6",
          pricePer1kInput: 0.006,
          pricePer1kOutput: 0.012,
          provider: "moonshot",
          subscriptionId: "applesay_api"
        },
        {
          capabilities: ["text", "premium_reasoning"],
          estimatedQualityRisk: 0.05,
          model: "gpt-5.5",
          pricePer1kInput: 0.02,
          pricePer1kOutput: 0.06,
          provider: "openai",
          subscriptionId: "gpt_plus"
        }
      ],
      requirements: {
        maxEstimatedCostUsd: 0.2,
        qualityRiskTolerance: 0.2,
        requiredCapabilities: ["vision", "browser_research"],
        taskClass: "visual_research",
        tokenEstimate: {
          input: 12000,
          output: 2000
        }
      },
      subscriptions: [
        {
          id: "zai_api",
          maxConcurrency: 1,
          remainingUsd: 2,
          status: "healthy",
          usedConcurrency: 0
        },
        {
          id: "applesay_api",
          maxConcurrency: 2,
          remainingUsd: 10,
          status: "healthy",
          usedConcurrency: 1
        },
        {
          id: "gpt_plus",
          maxConcurrency: 1,
          remainingUsd: 100,
          status: "healthy",
          usedConcurrency: 1
        }
      ]
    });

    expect(decision.status).toBe("selected");
    expect(decision.selected?.model).toBe("kimi-k2.6");
    expect(decision.rejected.find((item) => item.model === "glm-5.1")?.reasons).toContain("missing_capability:vision");
    expect(decision.rejected.find((item) => item.model === "gpt-5.5")?.reasons).toContain("concurrency_exhausted");
    expect(decision.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("requires human approval when every healthy route exceeds the budget envelope", () => {
    const decision = selectBudgetAwareRoute({
      candidates: [
        {
          capabilities: ["text", "premium_reasoning"],
          estimatedQualityRisk: 0.05,
          model: "gpt-5.5",
          pricePer1kInput: 0.03,
          pricePer1kOutput: 0.09,
          provider: "openai",
          subscriptionId: "gpt_plus"
        }
      ],
      requirements: {
        maxEstimatedCostUsd: 0.1,
        qualityRiskTolerance: 0.1,
        requiredCapabilities: ["premium_reasoning"],
        taskClass: "architecture_review",
        tokenEstimate: {
          input: 10000,
          output: 4000
        }
      },
      subscriptions: [
        {
          id: "gpt_plus",
          maxConcurrency: 1,
          remainingUsd: 5,
          status: "healthy",
          usedConcurrency: 0
        }
      ]
    });

    expect(decision.status).toBe("human_approval_required");
    expect(decision.rejected[0]?.reasons).toContain("estimated_cost_exceeds_task_cap");
  });
});
