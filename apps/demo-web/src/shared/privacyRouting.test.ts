// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessPrivacyRoute, DEFAULT_PRIVACY_POLICY, redactSecrets, scanSecrets } from "./privacyRouting";

describe("privacy-aware routing", () => {
  it("detects and redacts common secrets before cloud routing", () => {
    const content = 'OPENAI_API_KEY="sk-testsecretsecretsecretsecret"';

    expect(scanSecrets(".env", content)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "openai_style_key"
        })
      ])
    );
    expect(redactSecrets(content)).not.toContain("sk-testsecretsecretsecretsecret");
  });

  it("forces local-only routing for local-only file patterns", () => {
    const assessment = assessPrivacyRoute({
      files: [
        {
          content: "TOKEN=plain-secret-value",
          path: "infra/secrets/prod.env"
        }
      ],
      policy: DEFAULT_PRIVACY_POLICY,
      provider: "openai"
    });

    expect(assessment.decision).toBe("local_only");
    expect(assessment.reasons).toContain("file_policy_local_only");
  });

  it("allows cloud-redacted routing when only a cloud-allowed document contains a secret", () => {
    const assessment = assessPrivacyRoute({
      files: [
        {
          content: "Bearer token: sk-testsecretsecretsecretsecret",
          path: "docs/debug-log.md"
        }
      ],
      policy: DEFAULT_PRIVACY_POLICY,
      provider: "openai"
    });

    expect(assessment.decision).toBe("cloud_redacted");
    expect(assessment.files[0]?.redactedContent).toContain("[REDACTED_SECRET]");
  });
});
