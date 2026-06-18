import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { DemoEvent } from "./types";

interface JsonEnvelope {
  events?: DemoEvent[];
  runId?: string;
  updatedAt?: string;
  version?: string;
}

export function parseEventRecords(raw: string): DemoEvent[] {
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as JsonEnvelope;
      if (Array.isArray(parsed.events)) {
        return parsed.events;
      }
    } catch {
      const events = parseCompleteEventsFromEnvelope(trimmed);
      if (events.length > 0) {
        return events;
      }
    }
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as DemoEvent[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to NDJSON parsing.
    }
  }

  const events: DemoEvent[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const item = line.trim();
    if (!item) {
      continue;
    }

    try {
      events.push(JSON.parse(item) as DemoEvent);
    } catch {
      // Ignore partially-written or malformed event lines.
    }
  }

  return events;
}

function parseCompleteEventsFromEnvelope(raw: string): DemoEvent[] {
  const eventsKeyIndex = raw.indexOf('"events"');
  if (eventsKeyIndex < 0) {
    return [];
  }

  const arrayStart = raw.indexOf("[", eventsKeyIndex);
  if (arrayStart < 0) {
    return [];
  }

  const events: DemoEvent[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        try {
          events.push(JSON.parse(raw.slice(objectStart, index + 1)) as DemoEvent);
        } catch {
          // Ignore malformed complete-looking objects and keep any earlier events.
        }
        objectStart = -1;
      }
    }
  }

  return events;
}

export function loadEventRecords(eventsPath: string): DemoEvent[] {
  if (!existsSync(eventsPath)) {
    return [];
  }

  return parseEventRecords(readFileSync(eventsPath, "utf8"));
}

export function writeEventRecordEnvelope(eventsPath: string, runId: string, events: DemoEvent[], updatedAt: string) {
  mkdirSync(dirname(eventsPath), {
    recursive: true
  });
  const tempPath = join(dirname(eventsPath), `.${basename(eventsPath)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(
    tempPath,
    `${JSON.stringify(
      {
        version: "dragonboat.demo.events.v1",
        runId,
        updatedAt,
        events
      },
      null,
      2
    )}\n`
  );
  renameSync(tempPath, eventsPath);
}
