export type PrivacyRouteDecision = "blocked" | "cloud_allowed" | "cloud_redacted" | "local_only";

export interface PrivacyPolicy {
  cloudAllowedGlobs: string[];
  localOnlyGlobs: string[];
  providerAllowlist?: Record<string, string[]>;
  redactBeforeCloudProviders: string[];
}

export interface PrivacyRouteFile {
  content?: string;
  path: string;
}

export interface SecretFinding {
  end: number;
  kind: string;
  path: string;
  preview: string;
  start: number;
}

export interface PrivacyRouteAssessment {
  decision: PrivacyRouteDecision;
  files: Array<{
    path: string;
    redactedContent?: string;
    sensitivity: "cloud_allowed" | "local_only" | "secret_detected" | "unknown";
  }>;
  provider: string;
  reasons: string[];
  secretFindings: SecretFinding[];
}

const SECRET_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "openai_style_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  {
    kind: "named_secret",
    pattern: /\b(?:api[_-]?key|auth[_-]?token|bearer|client[_-]?secret|password|secret)\b\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]{12,})["']?/gi
  }
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function globToRegExp(glob: string) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DRAGONBOAT_GLOBSTAR__")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped.replace(/__DRAGONBOAT_GLOBSTAR__/g, ".*")}$`);
}

function matchesAny(path: string, globs: string[]) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function preview(secret: string) {
  if (secret.length <= 8) {
    return "[secret]";
  }
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export function scanSecrets(path: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const { kind, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const matched = match[0] ?? "";
      findings.push({
        end: (match.index ?? 0) + matched.length,
        kind,
        path,
        preview: preview(match[1] ?? matched),
        start: match.index ?? 0
      });
    }
  }

  return findings.sort((left, right) => left.start - right.start);
}

export function redactSecrets(content: string) {
  let redacted = content;
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      const key = match.split(/[:=]/).at(0);
      return key && key !== match ? `${key}=[REDACTED_SECRET]` : "[REDACTED_SECRET]";
    });
  }
  return redacted;
}

export function assessPrivacyRoute(input: {
  files: PrivacyRouteFile[];
  policy: PrivacyPolicy;
  provider: string;
}): PrivacyRouteAssessment {
  const secretFindings = input.files.flatMap((file) => scanSecrets(file.path, file.content ?? ""));
  const providerAllowedClasses = input.policy.providerAllowlist?.[input.provider]?.map(normalize);
  const providerAllowsPrivate = providerAllowedClasses?.includes("private_code") ?? false;
  const providerRequiresRedaction = input.policy.redactBeforeCloudProviders.map(normalize).includes(normalize(input.provider));
  const files: PrivacyRouteAssessment["files"] = input.files.map((file) => {
    const hasSecret = secretFindings.some((finding) => finding.path === file.path);
    const sensitivity: PrivacyRouteAssessment["files"][number]["sensitivity"] = hasSecret
      ? "secret_detected"
      : matchesAny(file.path, input.policy.localOnlyGlobs)
        ? "local_only"
        : matchesAny(file.path, input.policy.cloudAllowedGlobs)
          ? "cloud_allowed"
          : "unknown";

    return {
      path: file.path,
      redactedContent: file.content && (hasSecret || providerRequiresRedaction) ? redactSecrets(file.content) : undefined,
      sensitivity
    };
  });
  const reasons: string[] = [];

  if (files.some((file) => file.sensitivity === "local_only")) {
    reasons.push("file_policy_local_only");
  }
  if (secretFindings.length > 0) {
    reasons.push("secret_detected");
  }
  if (files.some((file) => file.sensitivity === "unknown") && !providerAllowsPrivate) {
    reasons.push("unknown_file_requires_local_or_private_provider");
  }

  let decision: PrivacyRouteDecision = "cloud_allowed";
  if (reasons.includes("file_policy_local_only")) {
    decision = "local_only";
  } else if (secretFindings.length > 0 && providerRequiresRedaction) {
    decision = "cloud_redacted";
  } else if (secretFindings.length > 0) {
    decision = "local_only";
  } else if (reasons.length > 0) {
    decision = "blocked";
  }

  return {
    decision,
    files,
    provider: input.provider,
    reasons,
    secretFindings
  };
}

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  cloudAllowedGlobs: ["docs/**", "README.md", "src/public-ui/**"],
  localOnlyGlobs: [".env*", "infra/secrets/**", "customer-data/**", "**/secrets/**"],
  providerAllowlist: {
    local_model: ["all_local_files", "private_code", "sensitive_logs"],
    codex_pro: ["public_code", "docs", "sanitized_logs"],
    claude_code: ["public_code", "private_code", "docs", "sanitized_logs"]
  },
  redactBeforeCloudProviders: ["codex_pro", "claude_code", "openai", "anthropic", "moonshot"]
};
