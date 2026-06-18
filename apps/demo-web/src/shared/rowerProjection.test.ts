import { describe, expect, it } from "vitest";
import { projectRowerOutput } from "./rowerProjection";
import type { DemoEvent } from "./types";

function commandOutput(seq: number, line: string, agentId = "agent_frontend"): DemoEvent {
  return {
    id: `evt_${seq}`,
    seq,
    runId: "run_mock",
    type: "command.output",
    actor: agentId,
    createdAt: `2026-05-25T0${seq}:00:00.000Z`,
    payload: {
      agentId,
      line
    }
  };
}

describe("projectRowerOutput", () => {
  it("extracts assistant markdown blocks from current Claude stream-json message.content shape", () => {
    const projection = projectRowerOutput(
      [
        commandOutput(
          1,
          JSON.stringify({
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "## Done\n- shipped projection" }]
            }
          })
        )
      ],
      "agent_frontend"
    );

    expect(projection.assistantBlocks).toHaveLength(1);
    expect(projection.assistantBlocks[0]).toMatchObject({
      content: "## Done\n- shipped projection",
      isMarkdown: true,
      source: "assistant_text"
    });
  });

  it("counts nested tool_use and tool_result records as noise-free hidden records", () => {
    const projection = projectRowerOutput(
      [
        commandOutput(
          1,
          JSON.stringify({
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "tool_use", id: "tool_1", name: "Bash" }]
            }
          })
        ),
        commandOutput(
          2,
          JSON.stringify({
            type: "user",
            message: {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: "tool_1", content: "ok" }]
            }
          })
        )
      ],
      "agent_frontend"
    );

    expect(projection.assistantBlocks).toEqual([]);
    expect(projection.stats.toolUseCount).toBe(1);
    expect(projection.stats.toolResultCount).toBe(1);
    expect(projection.stats.noiseCount).toBe(0);
  });

  it("uses the result record as final summary when present", () => {
    const projection = projectRowerOutput(
      [
        commandOutput(
          1,
          JSON.stringify({
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "working" }]
            }
          })
        ),
        commandOutput(2, JSON.stringify({ type: "result", result: "Final shipped summary" }))
      ],
      "agent_frontend"
    );

    expect(projection.finalSummary).toMatchObject({
      content: "Final shipped summary",
      source: "result_record"
    });
  });

  it("falls back to last raw agent speech when output is plain text", () => {
    const projection = projectRowerOutput([commandOutput(1, "Merged the frontend slice.")], "agent_frontend");

    expect(projection.assistantBlocks[0]).toMatchObject({
      content: "Merged the frontend slice.",
      isMarkdown: false,
      source: "raw_agent_speech"
    });
    expect(projection.finalSummary.source).toBe("last_agent_speech");
  });

  it("treats command echoes and stdout wrappers as noise", () => {
    const projection = projectRowerOutput(
      [commandOutput(1, "$ npm test"), commandOutput(2, "[stdout] noisy"), commandOutput(3, "")],
      "agent_frontend"
    );

    expect(projection.assistantBlocks).toEqual([]);
    expect(projection.stats.noiseCount).toBe(3);
  });

  it("drops ANSI-only terminal cleanup sequences from readable output", () => {
    const projection = projectRowerOutput(
      [
        commandOutput(
          1,
          "\u001b[?1006l\u001b[?1003l\u001b[?1002l\u001b[?1000l\u001b[>4m\u001b[<u\u001b[?1004l\u001b[?2031l\u001b[?2004l\u001b[?25h\u001b7\u001b[r\u001b8\u001b]0;\u0007\u001b[?25h"
        )
      ],
      "agent_frontend"
    );

    expect(projection.assistantBlocks).toEqual([]);
    expect(projection.finalSummary.source).toBe("none");
    expect(projection.stats.noiseCount).toBe(1);
  });
});
