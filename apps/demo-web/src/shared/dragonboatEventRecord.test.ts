// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEventRecords, writeEventRecordEnvelope } from "./dragonboatEventRecord";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DemoEvent } from "./types";

function event(seq: number): DemoEvent {
  return {
    actor: "agent_backend",
    createdAt: `2026-06-05T00:00:0${seq}.000Z`,
    id: `evt_${seq}`,
    payload: {
      agentId: "agent_backend",
      status: seq === 1 ? "running" : "done"
    },
    runId: "run_partial",
    seq,
    type: seq === 1 ? "command.started" : "command.finished"
  };
}

describe("dragonboat event records", () => {
  it("parses complete JSON envelopes", () => {
    const events = [event(1), event(2)];
    const raw = JSON.stringify(
      {
        events,
        runId: "run_partial",
        version: "dragonboat.demo.events.v1"
      },
      null,
      2
    );

    expect(parseEventRecords(raw)).toEqual(events);
  });

  it("salvages complete events from a partially-written JSON envelope", () => {
    const events = [event(1), event(2)];
    const raw = JSON.stringify(
      {
        events,
        runId: "run_partial",
        version: "dragonboat.demo.events.v1"
      },
      null,
      2
    );
    const truncated = raw.slice(0, raw.lastIndexOf("]"));

    expect(parseEventRecords(truncated)).toEqual(events);
  });

  it("writes event envelopes through a replaceable file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "dragonboat-events-"));
    const eventsPath = join(dir, "events.ndjson");

    try {
      writeEventRecordEnvelope(eventsPath, "run_partial", [event(1)], "2026-06-05T00:00:01.000Z");

      expect(existsSync(eventsPath)).toBe(true);
      expect(parseEventRecords(readFileSync(eventsPath, "utf8"))).toEqual([event(1)]);
    } finally {
      rmSync(dir, {
        force: true,
        recursive: true
      });
    }
  });
});
