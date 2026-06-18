export type RouteFallback = "block_if_unhealthy" | "use_text_default";

export interface RowerRoute {
  effort?: string;
  fallback?: RouteFallback;
  model?: string;
  reason?: string;
  requiredCapabilities?: string[];
  role?: string;
}

export interface RoutingRule {
  effort: string;
  fallback: RouteFallback;
  match: string[];
  model: string;
  reason: string;
  requires: string[];
}

export interface RoutingPolicy {
  models: {
    text_default: string;
    vision_default: string;
  };
  rules: RoutingRule[];
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  models: {
    text_default: "glm-5.1",
    vision_default: "kimi-k2.6"
  },
  rules: [
    {
      effort: "max",
      fallback: "block_if_unhealthy",
      match: [
        "browser_research",
        "dynamic_page_research",
        "product_page_research",
        "social_platform_research",
        "visual_research"
      ],
      model: "kimi-k2.6",
      reason:
        "This task needs browser-backed page observation or multimodal visual research, so DragonBoat should route it to a vision-capable rower and block if the browser capability is unhealthy.",
      requires: ["browser_research", "vision"]
    },
    {
      effort: "max",
      fallback: "block_if_unhealthy",
      match: ["frontend_design", "visual_qa", "screenshot_review", "ui_review", "image_review"],
      model: "kimi-k2.6",
      reason: "This task needs visual or multimodal understanding, so DragonBoat should not use a text-only rower.",
      requires: ["vision"]
    },
    {
      effort: "max",
      fallback: "use_text_default",
      match: ["backend", "qa_ops", "docs", "code_search", "refactor", "test", "interface_integration"],
      model: "glm-5.1",
      reason: "This task is text/code execution oriented and can use the lower-cost text rower model.",
      requires: ["text"]
    }
  ]
};

const VISUAL_WORDS = new Set([
  "frontend_design",
  "image",
  "image_review",
  "screenshot",
  "screenshot_review",
  "ui",
  "ui_review",
  "vision",
  "visual",
  "visual_qa",
  "前端设计",
  "图像",
  "截图",
  "视觉",
  "界面",
  "审美"
]);

const BROWSER_RESEARCH_WORDS = new Set([
  "browser",
  "browser_research",
  "cdp",
  "dynamic_page",
  "dynamic_page_research",
  "page_research",
  "product_page_research",
  "social_platform_research",
  "visual_research",
  "web_access",
  "web_research",
  "动态网页",
  "商品页",
  "浏览器",
  "网页调研",
  "社媒调研"
]);

const TEXT_WORDS = new Set(["text", "backend", "qa", "qa_ops", "docs", "code", "search", "文本", "后端", "测试", "文档"]);

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[／/]+/g, "_");
}

function normalizeRoleToken(value: string) {
  const token = normalizeToken(value);
  const roleAliases: Record<string, string> = {
    前端: "frontend",
    前端设计: "frontend_design",
    后端: "backend",
    接口: "interface",
    接口对接: "interface_integration",
    测试: "qa_ops",
    测试运维: "qa_ops",
    运维: "qa_ops",
    文档: "docs"
  };

  return roleAliases[token] ?? token;
}

function splitList(value: string) {
  return value
    .split(/[,\n，、/／]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanRouteValue(value: string) {
  return value
    .trim()
    .replace(/`+/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function normalizeCapability(value: string) {
  const token = normalizeToken(value);

  if (BROWSER_RESEARCH_WORDS.has(token) || [...BROWSER_RESEARCH_WORDS].some((word) => token.includes(word))) {
    return "browser_research";
  }

  if (VISUAL_WORDS.has(token) || [...VISUAL_WORDS].some((word) => token.includes(word))) {
    return "vision";
  }

  if (TEXT_WORDS.has(token) || [...TEXT_WORDS].some((word) => token.includes(word))) {
    return "text";
  }

  return token;
}

export function normalizeRouteRole(value: string) {
  return splitList(value)
    .map(normalizeRoleToken)
    .join("/");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function routeScore(rule: RoutingRule, role: string, capabilities: string[]) {
  const roleTokens = splitList(role).flatMap((item) => normalizeToken(item).split(/[_-]+/g));
  const normalizedRole = normalizeToken(role);
  const normalizedCapabilities = capabilities.map(normalizeCapability);
  let score = 0;

  for (const match of rule.match.map(normalizeToken)) {
    if (normalizedRole.includes(match) || roleTokens.includes(match)) {
      score += 2;
    }
  }

  for (const capability of rule.requires.map(normalizeCapability)) {
    if (normalizedCapabilities.includes(capability)) {
      score += 3;
    }
  }

  return score;
}

export function recommendRoute(
  policy: RoutingPolicy,
  input: {
    capabilities?: string[];
    role: string;
  }
): RowerRoute {
  const capabilities = unique((input.capabilities ?? ["text"]).map(normalizeCapability));
  const ranked = policy.rules
    .map((rule) => ({
      rule,
      score: routeScore(rule, input.role, capabilities)
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked.find((item) => item.score > 0)?.rule ?? policy.rules.at(-1);

  if (!best) {
    return {
      effort: "max",
      fallback: "use_text_default",
      model: policy.models.text_default,
      reason: "No routing rule matched; DragonBoat used the text default.",
      requiredCapabilities: capabilities,
      role: normalizeRouteRole(input.role)
    };
  }

  return {
    effort: best.effort,
    fallback: best.fallback,
    model: best.model,
    reason: best.reason,
    requiredCapabilities: unique(best.requires.map(normalizeCapability)),
    role: normalizeRouteRole(input.role)
  };
}

export function extractTaskPacketRoute(content: string): RowerRoute | null {
  const values = new Map<string, string>();

  for (const line of content.split(/\r?\n/g)) {
    const match = line.match(/^\s*[-*]\s*([^:：]+)\s*[:：]\s*(.+?)\s*$/);

    if (!match) {
      continue;
    }

    values.set(normalizeToken(match[1]), cleanRouteValue(match[2]));
  }

  const model = values.get("model") ?? values.get("模型");
  const effort = values.get("effort") ?? values.get("推理强度") ?? values.get("reasoning_effort");
  const role = values.get("rower_role") ?? values.get("role") ?? values.get("划手职责") ?? values.get("职责");
  const capabilities =
    values.get("required_capabilities") ?? values.get("capabilities") ?? values.get("能力") ?? values.get("所需能力");
  const reason = values.get("reason") ?? values.get("原因") ?? values.get("路由原因");
  const fallback = values.get("fallback") ?? values.get("降级策略");

  if (!model && !effort && !role && !capabilities && !reason && !fallback) {
    return null;
  }

  return {
    ...(effort ? { effort } : {}),
    ...(fallback === "block_if_unhealthy" || fallback === "use_text_default" ? { fallback } : {}),
    ...(model ? { model } : {}),
    ...(reason ? { reason } : {}),
    ...(capabilities ? { requiredCapabilities: unique(splitList(capabilities).map(normalizeCapability)) } : {}),
    ...(role ? { role: normalizeRouteRole(role) } : {})
  };
}

export function mergeRouteWithRecommendation(policy: RoutingPolicy, route: RowerRoute | null, fallbackRole: string) {
  if (!route) {
    return null;
  }

  const recommendation = recommendRoute(policy, {
    capabilities: route.requiredCapabilities,
    role: route.role ?? fallbackRole
  });

  return {
    ...recommendation,
    ...route,
    requiredCapabilities: route.requiredCapabilities ?? recommendation.requiredCapabilities,
    role: route.role ?? recommendation.role
  };
}

export function formatRouteForTaskPacket(route: RowerRoute) {
  return [
    "## Route",
    "",
    route.role ? `- Rower role: ${route.role}` : undefined,
    route.requiredCapabilities?.length ? `- Required capabilities: ${route.requiredCapabilities.join(", ")}` : undefined,
    route.model ? `- Model: ${route.model}` : undefined,
    route.effort ? `- Effort: ${route.effort}` : undefined,
    route.reason ? `- Reason: ${route.reason}` : undefined,
    route.fallback ? `- Fallback: ${route.fallback}` : undefined,
    ""
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}
