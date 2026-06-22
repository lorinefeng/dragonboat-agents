export interface RowerCheckpoint {
  agentId: string;
  changedFiles: string[];
  currentFocus: string;
  decisions: string[];
  evidencePaths: string[];
  handoffPaths: string[];
  nextActions: string[];
  openQuestions: string[];
  risks: string[];
  runId: string;
  status: string;
  summary: string;
  taskId: string;
  timestamp: string;
}

export type RowerCheckpointInput = Partial<RowerCheckpoint> &
  Pick<RowerCheckpoint, "agentId" | "runId" | "status" | "summary">;

export interface RowerCheckpointValidation {
  checkpoint?: RowerCheckpoint;
  errors: string[];
  ok: boolean;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
}

export function createRowerCheckpoint(input: RowerCheckpointInput, timestamp = new Date().toISOString()): RowerCheckpoint {
  const checkpoint: RowerCheckpoint = {
    agentId: normalizeString(input.agentId),
    changedFiles: normalizeStringList(input.changedFiles),
    currentFocus: normalizeString(input.currentFocus),
    decisions: normalizeStringList(input.decisions),
    evidencePaths: normalizeStringList(input.evidencePaths),
    handoffPaths: normalizeStringList(input.handoffPaths),
    nextActions: normalizeStringList(input.nextActions),
    openQuestions: normalizeStringList(input.openQuestions),
    risks: normalizeStringList(input.risks),
    runId: normalizeString(input.runId),
    status: normalizeString(input.status),
    summary: normalizeString(input.summary),
    taskId: normalizeString(input.taskId) || "task_general",
    timestamp: normalizeString(input.timestamp) || timestamp
  };

  const validation = validateRowerCheckpoint(checkpoint);
  if (!validation.ok) {
    throw new Error(`Invalid rower checkpoint: ${validation.errors.join(", ")}`);
  }

  return checkpoint;
}

export function validateRowerCheckpoint(value: unknown): RowerCheckpointValidation {
  const errors: string[] = [];
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  for (const field of ["agentId", "runId", "taskId", "status", "summary", "timestamp"]) {
    if (!normalizeString(record[field])) {
      errors.push(`${field} is required`);
    }
  }

  const timestamp = normalizeString(record.timestamp);
  if (timestamp && Number.isNaN(Date.parse(timestamp))) {
    errors.push("timestamp must be an ISO date string");
  }

  const checkpoint: RowerCheckpoint = {
    agentId: normalizeString(record.agentId),
    changedFiles: normalizeStringList(record.changedFiles),
    currentFocus: normalizeString(record.currentFocus),
    decisions: normalizeStringList(record.decisions),
    evidencePaths: normalizeStringList(record.evidencePaths),
    handoffPaths: normalizeStringList(record.handoffPaths),
    nextActions: normalizeStringList(record.nextActions),
    openQuestions: normalizeStringList(record.openQuestions),
    risks: normalizeStringList(record.risks),
    runId: normalizeString(record.runId),
    status: normalizeString(record.status),
    summary: normalizeString(record.summary),
    taskId: normalizeString(record.taskId),
    timestamp
  };

  return {
    checkpoint: errors.length === 0 ? checkpoint : undefined,
    errors,
    ok: errors.length === 0
  };
}

function markdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

export function formatRowerCheckpointMarkdown(checkpoint: RowerCheckpoint) {
  return [
    "# 划手状态检查点",
    "",
    `- 划手: \`${checkpoint.agentId}\``,
    `- Run: \`${checkpoint.runId}\``,
    `- 任务: \`${checkpoint.taskId}\``,
    `- 状态: ${checkpoint.status}`,
    `- 时间: ${checkpoint.timestamp}`,
    "",
    "## 摘要",
    "",
    checkpoint.summary,
    "",
    "## 当前焦点",
    "",
    checkpoint.currentFocus || "暂无",
    "",
    "## 已做决策",
    "",
    markdownList(checkpoint.decisions),
    "",
    "## 待确认问题",
    "",
    markdownList(checkpoint.openQuestions),
    "",
    "## 变更文件",
    "",
    markdownList(checkpoint.changedFiles),
    "",
    "## 交接与证据",
    "",
    "### Handoff",
    markdownList(checkpoint.handoffPaths),
    "",
    "### Evidence",
    markdownList(checkpoint.evidencePaths),
    "",
    "## 下一步",
    "",
    markdownList(checkpoint.nextActions),
    "",
    "## 风险",
    "",
    markdownList(checkpoint.risks),
    ""
  ].join("\n");
}
