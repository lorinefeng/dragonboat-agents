export const DELEGATION_SCORE_FIELDS = [
  "context_amortization",
  "parallel_split",
  "interface_stability",
  "acceptance_executability",
  "low_cost_rower_fit",
  "shared_state_penalty",
  "runtime_drift_penalty"
] as const;

export type DelegationScoreField = (typeof DELEGATION_SCORE_FIELDS)[number];
export type DelegationDecision = "crew_strong_fit" | "crew_candidate" | "single_agent_default";

export type DelegationScores = Record<DelegationScoreField, number>;

export interface DelegationFitAssessment {
  schema_version: "dragonboat.delegation_fit.v0";
  decision: DelegationDecision;
  fit_score: number;
  hard_blockers: string[];
  scores: DelegationScores;
}

export interface SealedTaskPacketInput {
  acceptance: string[];
  agentId: string;
  allowedPaths: string[];
  browserResearch?: {
    allowedDomains?: string[];
    browser?: string;
    screenshotRequirements?: string[];
    sourceUrls?: string[];
  };
  fit: DelegationFitAssessment;
  inputs: string[];
  mission: string;
  missionContract?: {
    nonGoals?: string[];
    requiredPeerInteractions?: string[];
    roleStance?: string;
    sharedMission?: string;
    synthesisOwner?: string;
  };
  role: string;
  runId?: string;
  taskId: string;
  workspaceRoot?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertScoreField(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${name} must be an integer from 0 to 3.`);
  }
}

export function assessDelegationFit(scores: DelegationScores, hardBlockers: string[] = []): DelegationFitAssessment {
  for (const field of DELEGATION_SCORE_FIELDS) {
    assertScoreField(field, scores[field]);
  }

  const fitScore =
    scores.context_amortization +
    scores.parallel_split +
    scores.interface_stability +
    scores.acceptance_executability +
    scores.low_cost_rower_fit -
    scores.shared_state_penalty -
    scores.runtime_drift_penalty;

  const cleanHardBlockers = hardBlockers.map((item) => item.trim()).filter(Boolean);
  let decision: DelegationDecision = "single_agent_default";

  if (cleanHardBlockers.length === 0) {
    if (fitScore >= 11) {
      decision = "crew_strong_fit";
    } else if (fitScore >= 8) {
      decision = "crew_candidate";
    }
  }

  return {
    decision,
    fit_score: fitScore,
    hard_blockers: cleanHardBlockers,
    schema_version: "dragonboat.delegation_fit.v0",
    scores: { ...scores }
  };
}

function list(items: string[], fallback = "- None") {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  return cleanItems.length > 0 ? cleanItems.map((item) => `- ${item}`).join("\n") : fallback;
}

function parseStringArray(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }

  return value;
}

export function parseDelegationFitAssessment(input: unknown): DelegationFitAssessment {
  if (!isRecord(input)) {
    throw new Error("Delegation fit must be a JSON object.");
  }

  if (input.schema_version !== "dragonboat.delegation_fit.v0") {
    throw new Error("Invalid delegation fit schema_version. Expected dragonboat.delegation_fit.v0.");
  }

  const decision = input.decision;
  if (decision !== "crew_strong_fit" && decision !== "crew_candidate" && decision !== "single_agent_default") {
    throw new Error("Invalid delegation fit decision. Expected crew_strong_fit, crew_candidate, or single_agent_default.");
  }

  if (!Number.isInteger(input.fit_score)) {
    throw new Error("Delegation fit fit_score must be an integer.");
  }

  if (!isRecord(input.scores)) {
    throw new Error("Delegation fit scores must be an object.");
  }

  const inputScores = input.scores;
  const scores = Object.fromEntries(
    DELEGATION_SCORE_FIELDS.map((field) => {
      const value = inputScores[field];
      if (typeof value !== "number") {
        throw new Error(`Delegation fit scores.${field} must be an integer from 0 to 3.`);
      }
      assertScoreField(`scores.${field}`, value);
      return [field, value];
    })
  ) as DelegationScores;

  const hardBlockers = parseStringArray(input.hard_blockers, "Delegation fit hard_blockers");
  const assessment = assessDelegationFit(scores, hardBlockers);

  if (input.fit_score !== assessment.fit_score) {
    throw new Error(`Invalid delegation fit fit_score. Expected ${assessment.fit_score} for the provided scores.`);
  }

  if (decision !== assessment.decision) {
    throw new Error(`Invalid delegation fit decision. Expected ${assessment.decision} for the provided scores and hard blockers.`);
  }

  return assessment;
}

export function formatDelegationAssessmentMarkdown(assessment: DelegationFitAssessment) {
  return [
    "# Delegation Fit Assessment",
    "",
    `Decision: ${assessment.decision}`,
    `Fit score: ${assessment.fit_score}`,
    "",
    "## Scores",
    "",
    ...DELEGATION_SCORE_FIELDS.map((field) => `- ${field}: ${assessment.scores[field]}`),
    "",
    "## Hard Blockers",
    "",
    list(assessment.hard_blockers),
    ""
  ].join("\n");
}

export function createSealedTaskPacket(input: SealedTaskPacketInput) {
  const missionContract = input.missionContract;
  const missionContractSection = missionContract
    ? [
        "## Crew Mission Contract",
        "",
        `- Shared Mission: ${missionContract.sharedMission?.trim() || "Not specified by steerer."}`,
        `- Final Synthesis Owner: \`${missionContract.synthesisOwner?.trim() || "agent_codex"}\``,
        `- Role Stance: ${missionContract.roleStance?.trim() || "Contribute only your assigned perspective to the shared mission."}`,
        "",
        "### Non-Goals",
        "",
        list(missionContract.nonGoals ?? ["Do not treat your local slice as the final crew conclusion."]),
        "",
        "### Required Peer Interaction",
        "",
        list(missionContract.requiredPeerInteractions ?? []),
        "",
        "### Intent Confirmation",
        "",
        `Before substantive work, send: \`.dragonboat/bin/dragonboat message send --from ${input.agentId} --to ${
          missionContract.synthesisOwner?.trim() || "agent_codex"
        } --task ${input.taskId} --type intent_confirmed --body "<shared mission / role stance / non-goals understood>"\``,
        "",
        "### Peer Challenge",
        "",
        "If Required Peer Interaction lists peers, challenge or align with them before final evidence.",
        `Use: \`.dragonboat/bin/dragonboat message send --from ${input.agentId} --to <peerAgentId> --task ${input.taskId} --type peer_challenge --body "<claim, concern, or request for counter-evidence>"\``,
        ""
      ]
    : [];
  const browserResearch = input.browserResearch;
  const browserResearchSection = browserResearch
    ? [
        "## Browser Research Capability",
        "",
        "- Tooling: web-access through Claude Code browser/CDP capability.",
        `- Browser: ${browserResearch.browser?.trim() || "chrome-or-user-default"}`,
        "- Allowed domains:",
        list(browserResearch.allowedDomains ?? []),
        "- Source URLs:",
        list(browserResearch.sourceUrls ?? []),
        "- Required screenshots:",
        list(browserResearch.screenshotRequirements ?? ["At least one screenshot proving the observed page state."]),
        "- Evidence task type: `browser_research`",
        "- Blocker rule: if CDP, web-access, screenshot capture, or multimodal interpretation is unavailable, stop and mailbox `agent_codex` with `--type blocker` instead of falling back to blind terminal fetching.",
        ""
      ]
    : [];

  return [
    `# Task Packet: ${input.agentId}`,
    "",
    "## Identity",
    "",
    `- Agent ID: \`${input.agentId}\``,
    `- Role: \`${input.role}\``,
    `- Task ID: \`${input.taskId}\``,
    `- Run ID: \`${input.runId ?? "unknown"}\``,
    `- Workspace Root: \`${input.workspaceRoot ?? "unknown"}\``,
    "",
    ...missionContractSection,
    "## Delegation Fit Snapshot",
    "",
    ...DELEGATION_SCORE_FIELDS.map((field) => `- ${field}: ${input.fit.scores[field]}`),
    `- fit_score: ${input.fit.fit_score}`,
    `- Decision: ${input.fit.decision}`,
    `- Hard blockers: ${input.fit.hard_blockers.length > 0 ? input.fit.hard_blockers.join(", ") : "none"}`,
    "",
    "## Mission",
    "",
    input.mission.trim(),
    "",
    ...browserResearchSection,
    "## Sealed Inputs",
    "",
    list(input.inputs),
    "",
    "## Allowed Scope",
    "",
    list(input.allowedPaths),
    "",
    "## Forbidden Scope",
    "",
    "- Do not widen beyond the sealed inputs unless you first mailbox the steerer with a blocker or scope question.",
    "- Do not reread the whole repository unless the steerer approves a context expansion.",
    "- Do not claim done without passing the evidence gate requirements.",
    "",
    "## Acceptance",
    "",
    list(input.acceptance),
    "",
    "## Evidence Requirements",
    "",
    "- Send required durable mailbox before evidence.",
    "- Include touched files, commands run, tracked workspace proof, and remaining risks.",
    "- Include screenshots for UI/UX work and hook/session proof for runtime watchdog work.",
    "",
    "## Escalation Rules",
    "",
    "- Stop and mailbox the steerer if the runtime differs from the environment snapshot.",
    "- Stop and mailbox the steerer if the acceptance path is no longer valid.",
    "- Stop and mailbox the steerer if you need repo-wide rediscovery.",
    ""
  ].join("\n");
}
