// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TerminalHub } from "./terminalHub";

describe("TerminalHub", () => {
  it("replays existing output before streaming new terminal chunks", () => {
    const hub = new TerminalHub({ maxBufferLines: 3 });
    hub.append("run_alpha", "agent_codex", "first\n");
    hub.append("run_alpha", "agent_codex", "second\n");

    const received: string[] = [];
    const unsubscribe = hub.subscribe("run_alpha", "agent_codex", (chunk) => received.push(chunk));

    hub.append("run_alpha", "agent_codex", "third\n");
    unsubscribe();
    hub.append("run_alpha", "agent_codex", "fourth\n");

    expect(received).toEqual(["first\n", "second\n", "third\n"]);
    expect(hub.snapshot("run_alpha", "agent_codex")).toBe("first\nsecond\nthird\nfourth\n");
  });
});
