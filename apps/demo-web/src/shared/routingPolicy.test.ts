// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTING_POLICY, extractTaskPacketRoute, recommendRoute } from "./routingPolicy";

describe("DragonBoat routing policy", () => {
  it("routes visual frontend work to the multimodal rower model", () => {
    expect(
      recommendRoute(DEFAULT_ROUTING_POLICY, {
        capabilities: ["vision"],
        role: "frontend_design"
      })
    ).toMatchObject({
      effort: "max",
      fallback: "block_if_unhealthy",
      model: "kimi-k2.6",
      requiredCapabilities: ["vision"]
    });
  });

  it("routes pure text backend work to the lower-cost text model", () => {
    expect(
      recommendRoute(DEFAULT_ROUTING_POLICY, {
        capabilities: ["text"],
        role: "backend"
      })
    ).toMatchObject({
      effort: "max",
      fallback: "use_text_default",
      model: "glm-5.1",
      requiredCapabilities: ["text"]
    });
  });

  it("routes browser research work to the multimodal rower model", () => {
    expect(
      recommendRoute(DEFAULT_ROUTING_POLICY, {
        capabilities: ["browser_research", "dynamic_page_research"],
        role: "visual_benchmark"
      })
    ).toMatchObject({
      effort: "max",
      fallback: "block_if_unhealthy",
      model: "kimi-k2.6",
      requiredCapabilities: expect.arrayContaining(["browser_research", "vision"])
    });
  });

  it("extracts Chinese task-packet route hints for the steerer skill", () => {
    expect(
      extractTaskPacketRoute(
        [
          "## Route",
          "-划手职责:前端设计/接口对接",
          "-模型:kimi-k2.6",
          "-推理强度:max",
          "-能力:视觉, 文本",
          "-原因: 这个任务需要根据截图做 UI QA"
        ].join("\n")
      )
    ).toEqual({
      effort: "max",
      model: "kimi-k2.6",
      reason: "这个任务需要根据截图做 UI QA",
      requiredCapabilities: ["vision", "text"],
      role: "frontend_design/interface_integration"
    });
  });

  it("strips Markdown code formatting from extracted route values", () => {
    expect(
      extractTaskPacketRoute(
        [
          "## Route",
          "- Model: `kimi-k2.6`",
          "- Effort: `max`",
          "- Fallback: `block_if_unhealthy`"
        ].join("\n")
      )
    ).toMatchObject({
      effort: "max",
      fallback: "block_if_unhealthy",
      model: "kimi-k2.6"
    });
  });
});
