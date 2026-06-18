#!/usr/bin/env node
import "tsx/esm";
import { runDragonBoatCli } from "../apps/demo-web/src/cli/dragonboatCli.ts";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage:",
      "  create-dragonboat [--workspace <path>]",
      "",
      "Scaffold DragonBoat into a project workspace.",
      "",
      "This is equivalent to:",
      "  dragonboat init [--workspace <path>]",
      "",
      "Generated files include:",
      "  .dragonboat/skills/",
      "  .dragonboat/commands.md",
      "  .dragonboat/routing-policy.json",
      "  .codex/hooks.json",
      "  .dragonboat/bin/dragonboat",
      "  AGENTS.md managed DragonBoat block"
    ].join("\n")
  );
  process.exitCode = 0;
} else {
const exitCode = await runDragonBoatCli(["init", ...args]);
process.exitCode = exitCode;
}
