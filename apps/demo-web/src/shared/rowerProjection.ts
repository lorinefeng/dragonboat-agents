import type {
  DemoEvent,
  ReadableAssistantBlock,
  ReadableFinalSummary,
  ReadableProjection,
  ReadableProjectionStats
} from "./types";

interface StreamContentItem {
  type?: string;
  text?: string;
}

const ANSI_ESCAPE_PATTERN =
  /\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~]|[78]|[@-Z\\-_])/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

function stripTerminalControlSequences(line: string): string {
  return line.replace(ANSI_ESCAPE_PATTERN, "").replace(CONTROL_CHAR_PATTERN, "");
}

function parseStreamJsonLine(line: string): Record<string, unknown> | null {
  const sanitized = stripTerminalControlSequences(line).trim();
  try {
    const parsed = JSON.parse(sanitized) as Record<string, unknown>;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMessageContentItems(json: Record<string, unknown>): StreamContentItem[] {
  if (!isRecord(json.message) || !Array.isArray(json.message.content)) {
    return [];
  }

  return json.message.content.filter(isRecord) as StreamContentItem[];
}

function extractAssistantMarkdownBlocks(json: Record<string, unknown>): string[] {
  if (json.type !== "assistant") {
    return [];
  }

  if (typeof json.subtype === "string" && json.subtype === "text" && typeof json.result === "string") {
    return json.result.trim() ? [json.result.trim()] : [];
  }

  return getMessageContentItems(json)
    .filter((item) => item.type === "text" && typeof item.text === "string" && item.text.trim())
    .map((item) => item.text!.trim());
}

function countToolUse(json: Record<string, unknown>): number {
  if (json.type === "assistant" && json.subtype === "tool_use") {
    return 1;
  }

  if (json.type !== "assistant") {
    return 0;
  }

  return getMessageContentItems(json).filter((item) => item.type === "tool_use").length;
}

function countToolResult(json: Record<string, unknown>): number {
  if (json.type === "tool_result") {
    return 1;
  }

  if (json.type !== "user") {
    return 0;
  }

  return getMessageContentItems(json).filter((item) => item.type === "tool_result").length;
}

function isRawAgentSpeech(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && !trimmed.startsWith("$") && !trimmed.startsWith("[stdout]") && !trimmed.startsWith("[stderr]");
}

function commandOutputEvents(events: DemoEvent[], agentId: string) {
  return events.filter(
    (event) => event.type === "command.output" && (event.payload?.agentId === agentId || event.actor === agentId)
  );
}

function deriveFinalSummary(
  assistantBlocks: ReadableAssistantBlock[],
  events: DemoEvent[],
  agentId: string
): ReadableFinalSummary {
  for (const event of [...commandOutputEvents(events, agentId)].reverse()) {
    const line = typeof event.payload?.line === "string" ? event.payload.line : "";
    const json = parseStreamJsonLine(line);
    if (json?.type === "result" && typeof json.result === "string" && json.result.trim()) {
      return {
        content: json.result.trim(),
        createdAt: event.createdAt,
        source: "result_record"
      };
    }
  }

  const lastAssistant = [...assistantBlocks].reverse().find((block) => block.source === "assistant_text");
  if (lastAssistant) {
    return {
      content: lastAssistant.content,
      createdAt: lastAssistant.createdAt,
      source: "last_assistant_block"
    };
  }

  const lastSpeech = [...assistantBlocks].reverse().find((block) => block.source === "raw_agent_speech");
  if (lastSpeech) {
    return {
      content: lastSpeech.content,
      createdAt: lastSpeech.createdAt,
      source: "last_agent_speech"
    };
  }

  return {
    content: "",
    createdAt: new Date(0).toISOString(),
    source: "none"
  };
}

export function projectRowerOutput(events: DemoEvent[], agentId: string): ReadableProjection {
  const stats: ReadableProjectionStats = {
    assistantBlockCount: 0,
    toolUseCount: 0,
    toolResultCount: 0,
    systemCount: 0,
    usageCount: 0,
    resultCount: 0,
    noiseCount: 0
  };
  const assistantBlocks: ReadableAssistantBlock[] = [];

  for (const event of commandOutputEvents(events, agentId)) {
    const line = typeof event.payload?.line === "string" ? event.payload.line : "";
    const trimmed = stripTerminalControlSequences(line).trim();
    if (!trimmed) {
      stats.noiseCount++;
      continue;
    }

    const json = parseStreamJsonLine(trimmed);
    if (json) {
      const markdownBlocks = extractAssistantMarkdownBlocks(json);
      if (markdownBlocks.length > 0) {
        for (const content of markdownBlocks) {
          assistantBlocks.push({
            seq: event.seq,
            content,
            createdAt: event.createdAt,
            isMarkdown: true,
            source: "assistant_text"
          });
          stats.assistantBlockCount++;
        }
        continue;
      }

      const toolUseCount = countToolUse(json);
      if (toolUseCount > 0) {
        stats.toolUseCount += toolUseCount;
        continue;
      }

      const toolResultCount = countToolResult(json);
      if (toolResultCount > 0) {
        stats.toolResultCount += toolResultCount;
        continue;
      }

      if (json.type === "system") {
        stats.systemCount++;
        continue;
      }

      if (json.type === "usage") {
        stats.usageCount++;
        continue;
      }

      if (json.type === "result") {
        stats.resultCount++;
        continue;
      }

      stats.noiseCount++;
      continue;
    }

    if (!isRawAgentSpeech(trimmed)) {
      stats.noiseCount++;
      continue;
    }

    assistantBlocks.push({
      seq: event.seq,
      content: trimmed,
      createdAt: event.createdAt,
      isMarkdown: false,
      source: "raw_agent_speech"
    });
    stats.assistantBlockCount++;
  }

  return {
    agentId,
    assistantBlocks,
    finalSummary: deriveFinalSummary(assistantBlocks, events, agentId),
    stats
  };
}
