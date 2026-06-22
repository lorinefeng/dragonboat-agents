import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatRowerCheckpointMarkdown,
  type RowerCheckpoint,
  validateRowerCheckpoint
} from "../shared/rowerCheckpoint";

function safeFileSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function checkpointTimestampSegment(timestamp: string) {
  return safeFileSegment(timestamp.replace(/[:]/g, "-"));
}

export interface WriteRowerCheckpointInput {
  checkpoint: RowerCheckpoint;
  runDir: string;
  workspaceRoot: string;
}

export interface WriteRowerCheckpointResult {
  historyJsonPath: string;
  historyMarkdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}

export function checkpointHistoryDir(runDir: string, agentId: string) {
  return join(runDir, "checkpoints", safeFileSegment(agentId));
}

export function latestCheckpointJsonPath(workspaceRoot: string, agentId: string) {
  return join(workspaceRoot, ".dragonboat", "checkpoints", `${safeFileSegment(agentId)}.current.json`);
}

export function latestCheckpointMarkdownPath(workspaceRoot: string, agentId: string) {
  return join(workspaceRoot, ".dragonboat", "checkpoints", `${safeFileSegment(agentId)}.current.md`);
}

export function writeRowerCheckpoint(input: WriteRowerCheckpointInput): WriteRowerCheckpointResult {
  const validation = validateRowerCheckpoint(input.checkpoint);
  if (!validation.ok || !validation.checkpoint) {
    throw new Error(`Invalid rower checkpoint: ${validation.errors.join(", ")}`);
  }

  const agentDir = checkpointHistoryDir(input.runDir, validation.checkpoint.agentId);
  const latestDir = join(input.workspaceRoot, ".dragonboat", "checkpoints");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(latestDir, { recursive: true });

  const timestamp = checkpointTimestampSegment(validation.checkpoint.timestamp);
  const historyJsonPath = join(agentDir, `${timestamp}.json`);
  const historyMarkdownPath = join(agentDir, `${timestamp}.md`);
  const latestJsonPath = latestCheckpointJsonPath(input.workspaceRoot, validation.checkpoint.agentId);
  const latestMarkdownPath = latestCheckpointMarkdownPath(input.workspaceRoot, validation.checkpoint.agentId);
  const json = `${JSON.stringify(validation.checkpoint, null, 2)}\n`;
  const markdown = formatRowerCheckpointMarkdown(validation.checkpoint);

  writeFileSync(historyJsonPath, json);
  writeFileSync(historyMarkdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);

  return {
    historyJsonPath,
    historyMarkdownPath,
    latestJsonPath,
    latestMarkdownPath
  };
}

export function readLatestRowerCheckpoint(workspaceRoot: string, agentId: string): RowerCheckpoint | undefined {
  const filePath = latestCheckpointJsonPath(workspaceRoot, agentId);
  if (!existsSync(filePath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const validation = validateRowerCheckpoint(parsed);
  return validation.ok ? validation.checkpoint : undefined;
}

export function listRowerCheckpoints(runDir: string, agentId: string): RowerCheckpoint[] {
  const dir = checkpointHistoryDir(runDir, agentId);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
      const validation = validateRowerCheckpoint(parsed);
      return validation.checkpoint;
    })
    .filter((checkpoint): checkpoint is RowerCheckpoint => Boolean(checkpoint));
}
