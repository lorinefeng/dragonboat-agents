import { execFile } from "node:child_process";
import { resolveClaudeCommand } from "./cliArgs.ts";

export interface ClaudeRouteProbeResult {
  exitCode?: number | null;
  signal?: string | null;
  stderr: string;
  stdout: string;
}

export interface ClaudeRouteHealthCheckInput {
  command?: string;
  cwd: string;
  effort?: string;
  env?: Record<string, string | undefined>;
  model?: string;
  runner?: ClaudeRouteProbeRunner;
  timeoutMs?: number;
}

export interface ClaudeRouteHealthResult {
  command: string;
  durationMs: number;
  exitCode?: number | null;
  message: string;
  model?: string;
  ok: boolean;
  raw?: string;
  signal?: string | null;
}

export type ClaudeRouteProbeRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  }
) => Promise<ClaudeRouteProbeResult>;

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_PROMPT =
  "请只回复 ok。DragonBoat 正在启动划手前检查 Claude Code 的模型路由是否健康。";

function cleanEnv(env: Record<string, string | undefined> = {}) {
  const output: NodeJS.ProcessEnv = {
    ...process.env
  };

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
}

function redacted(text: string, env: Record<string, string | undefined> = {}) {
  let output = text;

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.length < 8) {
      continue;
    }

    if (/(TOKEN|KEY|SECRET|PASSWORD|AUTH)/i.test(key)) {
      output = output.split(value).join("[redacted]");
    }
  }

  return output;
}

function compact(text: string, env: Record<string, string | undefined> = {}) {
  return redacted(text, env)
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function defaultClaudeRouteProbeRunner(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  }
): Promise<ClaudeRouteProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        encoding: "utf8",
        env: options.env,
        maxBuffer: 1024 * 1024,
        timeout: options.timeoutMs
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(error, {
              stderr,
              stdout
            })
          );
          return;
        }

        resolve({
          exitCode: 0,
          signal: null,
          stderr,
          stdout
        });
      }
    );
  });
}

function healthCheckArgs(input: ClaudeRouteHealthCheckInput) {
  const env = input.env ?? {};
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    env.DRAGONBOAT_CLAUDE_PERMISSION_MODE ?? "auto"
  ];

  if (input.model) {
    args.push("--model", input.model);
  }

  if (input.effort) {
    args.push("--effort", input.effort);
  }

  args.push(HEALTH_CHECK_PROMPT);
  return args;
}

function parseJsonLines(stdout: string) {
  const parsed: Array<Record<string, unknown>> = [];

  for (const line of stdout.split(/\r?\n/g)) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("{")) {
      continue;
    }

    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object") {
        parsed.push(value as Record<string, unknown>);
      }
    } catch {
      // Claude stream-json can include non-JSON progress lines in some wrappers.
    }
  }

  return parsed;
}

function summarizeProbe(result: ClaudeRouteProbeResult, env: Record<string, string | undefined>) {
  const records = parseJsonLines(result.stdout);
  const init = records.find((record) => record.type === "system" && record.subtype === "init");
  const resultRecord = [...records].reverse().find((record) => record.type === "result");
  const model = typeof init?.model === "string" ? init.model : undefined;
  const raw = compact([result.stdout, result.stderr].filter(Boolean).join("\n"), env);

  if (resultRecord) {
    const isError = resultRecord.is_error === true;
    const apiErrorStatus = resultRecord.api_error_status;
    const resultText = typeof resultRecord.result === "string" ? resultRecord.result.trim() : "";

    if (isError || typeof apiErrorStatus === "number") {
      const statusText = typeof apiErrorStatus === "number" ? `${apiErrorStatus} ` : "";
      return {
        message: `${statusText}${resultText || "Claude route check failed."}`.trim(),
        model,
        ok: false,
        raw
      };
    }

    return {
      message: "Claude route check passed.",
      model,
      ok: true,
      raw
    };
  }

  if (result.exitCode && result.exitCode !== 0) {
    return {
      message: raw || `Claude route check exited with code ${result.exitCode}.`,
      model,
      ok: false,
      raw
    };
  }

  return {
    message: raw ? "Claude route check completed without a result event." : "Claude route check produced no output.",
    model,
    ok: Boolean(raw),
    raw
  };
}

export async function checkClaudeRouteHealth(
  input: ClaudeRouteHealthCheckInput
): Promise<ClaudeRouteHealthResult> {
  const startedAt = Date.now();
  const env = input.env ?? {};
  const command = input.command ?? resolveClaudeCommand(env);
  const args = healthCheckArgs(input);
  const runner = input.runner ?? defaultClaudeRouteProbeRunner;
  const timeoutMs = input.timeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;

  try {
    const result = await runner(command, args, {
      cwd: input.cwd,
      env: cleanEnv(env),
      timeoutMs
    });
    const summary = summarizeProbe(result, env);

    return {
      command,
      durationMs: Date.now() - startedAt,
      exitCode: result.exitCode ?? 0,
      message: summary.message,
      model: summary.model ?? input.model,
      ok: summary.ok,
      raw: summary.raw,
      signal: result.signal ?? null
    };
  } catch (cause) {
    const error = cause as Error & {
      code?: string | number;
      killed?: boolean;
      signal?: string | null;
      stderr?: string;
      stdout?: string;
    };
    const output = compact([error.stdout, error.stderr, error.message].filter(Boolean).join("\n"), env);
    const summary = summarizeProbe(
      {
        exitCode: typeof error.code === "number" ? error.code : 1,
        signal: error.signal ?? null,
        stderr: error.stderr ?? "",
        stdout: error.stdout ?? ""
      },
      env
    );

    return {
      command,
      durationMs: Date.now() - startedAt,
      exitCode: typeof error.code === "number" ? error.code : 1,
      message: summary.raw ? summary.message : output || "Claude route check failed.",
      model: summary.model ?? input.model,
      ok: false,
      raw: summary.raw || output,
      signal: error.signal ?? null
    };
  }
}
