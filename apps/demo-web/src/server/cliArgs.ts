import { existsSync } from "node:fs";

interface CodexSteererArgsInput {
  env?: Record<string, string | undefined>;
  outputLastMessagePath: string;
  prompt: string;
  repoRoot: string;
}

interface ClaudeRowerArgsInput {
  agentId: string;
  env?: Record<string, string | undefined>;
  prompt: string;
  sessionId: string;
}

const DEFAULT_CLAUDE_ROWER_PERMISSION_MODE = "auto";
const CLAUDE_ROWER_ALLOWED_TOOLS = [
  "Bash(.dragonboat/bin/dragonboat *)",
  "Bash(./.dragonboat/bin/dragonboat *)",
  "Bash(npm *)",
  "Bash(git *)",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep"
].join(",");

const CLAUDE_NATIVE_BINARY_CANDIDATES = [
  "/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-arm64/claude",
  "/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-x64/claude",
  "/usr/local/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-arm64/claude",
  "/usr/local/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-x64/claude",
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude"
];

export function resolveClaudeCommand(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DRAGONBOAT_CLAUDE_BIN?.trim();

  if (configured) {
    return configured;
  }

  return CLAUDE_NATIVE_BINARY_CANDIDATES.find((candidate) => existsSync(candidate)) ?? "claude";
}

export function buildCodexSteererArgs({
  env = process.env,
  outputLastMessagePath,
  prompt,
  repoRoot
}: CodexSteererArgsInput): string[] {
  const args = ["exec", "--json", "-C", repoRoot, "-o", outputLastMessagePath];
  const profile = env.DRAGONBOAT_CODEX_PROFILE;
  const model = env.DRAGONBOAT_CODEX_MODEL;

  if (profile) {
    args.push("--profile", profile);
  } else if (model) {
    args.push("--model", model);
  }

  args.push(prompt);
  return args;
}

export function buildClaudeRowerArgs({
  agentId,
  env = process.env,
  prompt,
  sessionId
}: ClaudeRowerArgsInput): string[] {
  return [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--name",
    agentId,
    "--session-id",
    sessionId,
    "--permission-mode",
    env.DRAGONBOAT_CLAUDE_PERMISSION_MODE ?? DEFAULT_CLAUDE_ROWER_PERMISSION_MODE,
    `--allowedTools=${env.DRAGONBOAT_CLAUDE_ALLOWED_TOOLS ?? CLAUDE_ROWER_ALLOWED_TOOLS}`,
    prompt
  ];
}
