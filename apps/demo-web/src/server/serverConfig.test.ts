// @vitest-environment node
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApiOptionsFromEnv } from "./serverConfig";

describe("demo server config", () => {
  it("does not force a global event record path unless explicitly configured", () => {
    expect(demoApiOptionsFromEnv({})).toEqual({});
    expect(demoApiOptionsFromEnv({ DRAGONBOAT_EVENT_RECORD_PATH: "/tmp/events.json" })).toEqual({
      eventRecordPath: "/tmp/events.json"
    });
  });

  it("scopes the run store to DRAGONBOAT_WORKSPACE_ROOT when a deck targets a workspace", () => {
    const workspaceRoot = "/tmp/dragonboat-workspace";

    expect(demoApiOptionsFromEnv({ DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot })).toEqual({
      runStoreDir: join(resolve(workspaceRoot), ".dragonboat", "runs"),
      workspaceRoot: resolve(workspaceRoot)
    });
  });
});
