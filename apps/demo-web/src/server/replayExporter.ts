import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DemoEvent, DemoLanguage } from "../shared/types";

export interface ReplayExportInput {
  events: DemoEvent[];
  language?: DemoLanguage;
  outputDir: string;
  packageDir: string;
}

export interface ReplayExportResult {
  fileName: string;
  filePath: string;
}

export type ReplayExporter = (input: ReplayExportInput) => Promise<ReplayExportResult>;

interface RemotionReplayExporterOptions {
  command?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const output: string[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Replay export timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      output.push(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output.push(chunk.toString("utf8"));
    });

    child.once("error", (cause) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(cause);
    });

    child.once("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Replay export failed with exit code ${code ?? 1}.\n${output.join("")}`));
    });
  });
}

export function createRemotionReplayExporter(options: RemotionReplayExporterOptions = {}): ReplayExporter {
  const command = options.command ?? "npx";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async ({ events, language = "zh", outputDir, packageDir }) => {
    mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `dragonboat-replay-${stamp}.mp4`;
    const filePath = join(outputDir, fileName);
    const propsPath = join(outputDir, `dragonboat-replay-${stamp}.props.json`);
    const entryPoint = join(packageDir, "src", "replay", "index.ts");

    writeFileSync(
      propsPath,
      `${JSON.stringify(
        {
          title: language === "zh" ? "DragonBoat 协作层回放：不是包装器，是一支队伍" : "DragonBoat Crew Coordination Replay",
          events
        },
        null,
        2
      )}\n`
    );

    await runCommand(
      command,
      [
        "remotion",
        "render",
        entryPoint,
        "AgentCommunicationReplay",
        filePath,
        "--props",
        propsPath,
        "--overwrite",
        "--log",
        "warn"
      ],
      packageDir,
      timeoutMs
    );

    return {
      fileName: basename(fileName),
      filePath
    };
  };
}
