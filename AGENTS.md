# AGENTS.md

This repository is for DragonBoat, a local-first crew layer for cross-platform coding agents.

## Communication

- Use Chinese when conversing with the project owner unless they request another language.
- Write project-facing documentation in English by default.
- Keep README, architecture, protocol, schema, and agent-facing docs concise and agent-readable.

## Product Direction

DragonBoat is not a generic agent wrapper. Its center of gravity is coordination semantics:

- crew identity
- task packets
- peer-to-peer mailbox messages
- evidence bundles
- local event logs
- command-deck replay

The v0.1 demo direction is:

- `dragonboat steer` runs from the user's project directory and foreground-launches the native Codex CLI as the steerer.
- Claude Code CLI acts as dynamically controlled rower workers.
- The Codex steerer decides the rower count and role split after reading the steerer skill and getting user confirmation.
- Each worker uses an isolated worktree.
- The local web command deck shows progress, mailbox traffic, agent console output, event streams, evidence, and replay.

Treat this demo stack as the first proof, not as the permanent architecture. DragonBoat must remain cross-platform and user-owned.

## Current Phase

The repository is now in v0.1 demo implementation mode.

Implementation code, dependencies, generated apps, and framework choices are allowed when the current task explicitly advances the agreed DragonBoat crew-loop demo.

The current v0.1 implementation baseline is documented in:

- `docs/v0.1-data-contracts.md`
- `docs/adapters/codex-cli.md`
- `docs/adapters/claude-code-cli.md`
- `docs/first-crew-loop-acceptance.md`
- `docs/v0.1-technical-decisions.md`
- `docs/product-features.md`
- `docs/delegation-economics.md`
- `docs/dynamic-workflow-readiness.md`
- `schemas/v0/*.schema.json`

## Current Demo Surface

Recent implementation work has established the local web command deck as the primary v0.1 demo surface:

- React Flow renders a draggable crew relationship graph from actual session state instead of assuming a fixed one-plus-three crew.
- The graph shows steerer-to-rower command links and rower-to-rower peer links for the rowers that actually exist.
- Link messages can be previewed or pinned, and peer links aggregate both directions by timestamp.
- Node drag positions are saved locally per run and per desktop/narrow layout, so visual tweaks do not change backend crew semantics.
- User follow-up instructions for real runs should be typed in the foreground Codex CLI, not into the web command deck.
- Steerer session history filters out command/tool noise and keeps human/agent text readable.
- Mailbox, evidence, agent logs, local events, and replay export remain available as lower debugging and verification views.
- The visual system uses DragonBoat brand colors, image-generated steerer/rower assets, locally embedded water-wave graph textures, and light/dark command-deck themes.
- Dark theme uses a dedicated dark-background DragonBoat wordmark asset so the logo does not dominate the command deck.
- Local sessions live under `.dragonboat/runs/<run_id>/`.
- The command deck exposes a left session rail, per-session event streams, task packet/log directories, session deletion, and read-only CLI mirrors per Agent.
- New sessions require a local workspace directory selected through the folder picker; the selected path is stored as `workspaceRoot` and used as the run root for the fullstack crew session.
- The web command deck now delegates workspace selection to the macOS native folder chooser via the backend instead of rendering an in-app folder browser.
- Demo seed sessions should not silently reappear in live mode after deletion; a clean command deck can wait for the owner to choose a workspace.
- Terminal mirroring uses the built-in `node-pty`/`ws`/draggable web drawer path; it does not depend on `tmux`, `ttyd`, or GoTTY.
- The web command deck no longer exposes the old fixed real-CLI starter or Web-to-Codex stdin composer.
- Crew graph edges use smooth Bezier custom edges rather than step paths; steerer links are solid and peer links stay dashed to preserve communication semantics.
- `dragonboat steer` registers the current project as a DragonBoat session, records `workspaceRoot` and project name, injects `DRAGONBOAT_RUN_ID`, `DRAGONBOAT_WORKSPACE_ROOT`, and `DRAGONBOAT_API_URL`, then launches foreground `codex -C <workspace>`.
- `dragonboat init` installs the workspace bootstrap kit: `.dragonboat/skills/`, `.dragonboat/commands.md`, `.dragonboat/bin/dragonboat`, task packet, handoff, evidence folders, and a managed DragonBoat block in the target workspace `AGENTS.md`.
- `dragonboat install-command` installs a user-level command shim so the owner can run `dragonboat steer` from any project directory instead of relying on a DragonBoat-repo-relative `./bin/dragonboat.mjs` path.
- `dragonboat doctor` checks that the bootstrap kit exists and that the local API is reachable before the owner expects a real crew loop.
- If the local API is not reachable, DragonBoat CLI must print an actionable server-start hint instead of leaking a raw `fetch failed`.
- The `bin/dragonboat.mjs` entrypoint runs through Node ESM/tsx, so CLI-loaded modules must avoid extensionless cross-layer imports that only the bundler understands.
- The demo API should default to workspace-local per-session state and event files under `.dragonboat/runs/<run_id>/`; only use `DRAGONBOAT_EVENT_RECORD_PATH` when a deliberately global debug event file is required.
- The local DragonBoat CLI now includes `rower start`, `rower stop`, `message send`, `message broadcast`, and `evidence submit` commands for the Codex steerer to control Claude rowers through the local API.
- The backend is the Claude rower PTY host: it starts/stops dynamic Claude Code sessions, mirrors stdout/stderr, writes mailbox/evidence/status events, and keeps rowers in DragonBoat-managed worktrees.
- Dynamic `rower start` runs Claude Code rowers in job mode with `claude --print --output-format stream-json <task-packet>` instead of relying on the interactive TUI prompt box, and records the initial `agent_codex -> rower` instruction as mailbox traffic; rower evidence must still be submitted by the rower and must not be faked by startup code.
- Dynamic `rower start` checks Claude Code route health before PTY startup unless `DRAGONBOAT_CLAUDE_ROUTE_CHECK=0`; failures block the rower and owned task, write the provider error to command output, and create a blocker mailbox entry instead of burning a full worker attempt.
- DragonBoat now has a capability-aware routing policy: `glm-5.1` is the default low-cost text/code rower model, while `kimi-k2.6` is the default multimodal route for frontend design, screenshot review, UI QA, and other visual work.
- Browser research is opt-in through `browser_research`, `dynamic_page_research`, `visual_research`, and `social_platform_research`; run `dragonboat browser doctor` before launching these rowers, and require sources, screenshots, browser/CDP commands, and risks in `browser_research` evidence.
- Rower startup must record explainable `route.decision.recorded` events so model choices are auditable and replayable.
- The bootstrap kit installs `.dragonboat/routing-policy.json`, `dragonboat route recommend`, and `dragonboat route set`; task packets should include a `## Route` block so `rower start` can pass the selected Claude model/effort into startup args and health checks.
- First Crew Loop acceptance is now a scriptable gate: `dragonboat acceptance first-crew-loop` checks the active foreground run, while `--run`, `--latest`, and `--events` support explicit review. The gate verifies dynamic backend/frontend/QA rower startup, terminal command starts, mailbox handoffs, evidence submissions, and rower stop lifecycle.
- The first real DragonBoat self-iteration run passed this gate on `run_2026-05-24T08_53_56Z`; treat it as the baseline proof, then keep hardening for repeatability rather than expanding surface area first.
- Replay Launch Artifact v0 should explain DragonBoat as a crew coordination layer, showing steerer, dynamic rowers, model routing, mailbox, evidence, and acceptance chapters.
- Replay Launch Acceptance is available through `dragonboat acceptance replay-launch`; use it to verify that an event source and optional MP4 carry the minimum launch story before treating replay output as public-facing evidence.
- Advisor Channel v0 is available through `dragonboat advisor send` and `dragonboat advisor inbox`; advisor notes are recorded as `advisor.message.sent` and `advisor -> agent_codex` mailbox traffic, but must not be treated as human instructions.
- Mailbox/Evidence Guardrail v0 rejects canonical backend/frontend/QA evidence until the required durable mailbox handoff exists.
- Structured Handoff Ack v0 makes substantive peer deliveries explicit: rowers should submit structured handoffs, recipients should ack consumed handoffs, and `dragonboat task complete` should close handoff/evidence/status/gate events together.
- Context Bundle v0 is available through `dragonboat context bundle --agent <agentId> --task <taskId>` and `GET /api/sessions/:runId/context-bundle`; use it for provider-neutral agent handoff instead of raw transcript copying.
- Crew Lessons v0 lives at `.dragonboat/crew-lessons.md`; steerer plans and rower task packets should read it so lessons from failed handoffs, QA reviews, visual evidence gaps, and user feedback carry into the next crew run.
- Delegation Economics v0 is available through `dragonboat delegate assess`, `dragonboat delegate packet`, `dragonboat evidence gate`, and `dragonboat benchmark record/compare`; use it before launching rowers so low-fit tasks stay with the foreground steerer and crew tasks become sealed, reviewable, and benchmarkable.
- Dynamic Workflow Readiness v0 is available through `dragonboat workflow assess|draft|validate|run|pause|resume|stop`; use it for staged fan-out, cross-checking, claim voting, cost/risk caps, and small live phase runs, not as a reason to chase large agent counts.
- P1 agentic economics adds `route budget`, `capability matrix`, `cost trace`, `workflow pack`, and `benchmark suite`; use these to make routing, skill cards, cost waste, reusable workflow patterns, and mode comparisons explicit.
- P2 agent compute economics adds `compute plan`, `privacy route/redact`, `subscription advise`, `marketplace`, and `capability learn`; use these before sending private work to remote workers, buying/routing subscriptions, or trusting long-run capability assumptions.
- Crew Mission Contract v0 and `dragonboat supervise wait` are the live coordination path for multi-rower work; watchdog is a wake-up bridge, not a background supervisor.
- Local inbox fallback queues API-down or PTY-missing mailbox messages under `.dragonboat/runs/<run_id>/inbox/<agentId>/` so rowers have a pollable instruction channel even when live injection is unavailable.
- For First Crew Loop acceptance, mailbox handoffs are durable and must not wait for the recipient rower process to be live; canonical backend/frontend/QA rower prompts receive injected guardrails that restate the required mailbox and evidence commands, including explicit `--from` and `--task` flags for rower-originated handoffs.
- Dynamic rower worktrees are overlaid with the current workspace files on every start, including uncommitted DragonBoat source and `.dragonboat` bootstrap kit files; heavy/runtime directories such as `.git`, `node_modules`, `.worktrees`, `.dragonboat-worktrees`, and `.dragonboat/runs` stay excluded.
- When a dynamic rower exits, DragonBoat syncs `.dragonboat/handoffs/` and `.dragonboat/evidence/` files from that rower's isolated worktree back to the tracked workspace so downstream rowers can review upstream artifacts.
- Claude rowers default to `--permission-mode auto` with a narrow `--allowedTools=...` allowlist for DragonBoat control commands, npm, git, and basic file tools; pass the allowlist as a single `--allowedTools=<comma-list>` argument so it cannot consume the prompt.
- When a rower submits evidence, the matching task should project to `evidence_submitted` with high progress unless it is already in a terminal reviewed/stopped/verified state.
- Dynamic `rower stop` also marks the owned task as `stopped` so the command deck does not show a stopped rower with a still-running task.
- Web Human Loop injection is disabled for foreground Codex sessions; the owner should type follow-up instructions directly into native Codex CLI.
- Per-run Agent runtime config lives at `.dragonboat/runs/<run_id>/agent-config.json`; model/effort controls are embedded in each Agent graph node and map edits into live PTY slash commands.
- Canonical dynamic Claude rowers (`agent_frontend`, `agent_backend`, `agent_qa_ops`) must also receive the stored per-run `model` and `effort` as CLI startup args on the next `rower start`; non-canonical ad hoc rowers continue to use provider defaults until routing is generalized.
- Foreground Codex route changes are observed from the native terminal status line and written back as `agent.config.updated` events; `dragonboat config set --agent agent_codex --model <model> --effort <effort>` is the explicit fallback sync path.
- Agent node model controls open below the full node card, and generated motif assets are masked/aligned inside the card so status and CLI controls stay readable.
- Start unrelated new tasks with `rower start --new-wave` or archive stale rowers first, so the command deck's current graph shows only the active crew wave; user-facing task packets should include `Display Name`, `Display Role Zh`, and `Display Role En`.
- If a user assists or takes over a rower, read that rower's latest `划手状态检查点` before continuing coordination or accepting its output.
- Codex effort values are `low`, `medium`, `high`, and `xhigh`; Claude Code effort values are `low`, `medium`, `high`, and `max`.
- Crew status projection keeps tasks aligned with rower lifecycle: `blocked` rowers mark their owned tasks `blocked`, `done` rowers mark them `done` unless evidence has already been submitted, and stopped rowers mark tasks `stopped`.
- Steerer Watchdog v0 is installed through workspace-local `.codex/hooks.json`; `dragonboat steer` installs a hook bound to that workspace's `.dragonboat/bin/dragonboat` path, resumes a running session for the same workspace when available, and `dragonboat watchdog stop-check` reads local run files to continue Codex when rower mailbox/evidence/lifecycle events need review.

Keep this section current after meaningful implementation work. If this file grows beyond 300 lines, stop updating it and ask the project owner to approve a cleanup pass.

## Product Feature Ledger

- `docs/product-features.md` is the chronological product milestone ledger for DragonBoat.
- When a long-term product capability lands, changes shape, or becomes part of the public story, update that document with the implemented milestone, user-facing value, and current known gaps before claiming the iteration is complete.
- Keep detailed capability history in `docs/product-features.md`; keep this file focused on durable instructions for agents.

## Design Principles

- Local-first before cloud-first.
- Cross-platform before vendor-specific convenience.
- Evidence before claims.
- User-owned model routing before provider lock-in.
- Small verifiable tasks before autonomous mega-runs.
- Local web command deck as the first replay and monitoring surface, not as an agent configuration replacement.

## Implementation Guardrails

When implementation begins:

- Prefer the repo's existing patterns over new abstractions.
- Keep agent adapters separated from core crew/task/evidence semantics.
- Validate task packets and evidence bundles against `schemas/v0`.
- Keep mailbox message-type contracts aligned across shared types, API validation, CLI docs, bootstrap commands, and skills before relying on a new coordination protocol in a real crew run.
- Keep worker outputs auditable: commands, logs, diffs, failures, and risks.
- Avoid hidden destructive operations.
- Never assume all agents support the same real-time control APIs.
- Use soft real-time delivery where needed: hooks/plugins when available, polling when necessary.
- When a long-term product capability lands or changes shape, update `docs/product-features.md` with the milestone, user-facing value, and current known gaps so launch and open-source positioning can be reconstructed later.
- When release entrypoints change, keep `README.md`, package metadata, `dragonboat doctor`, and the bootstrap command docs aligned so the project remains one-command approachable.
- Before public-release claims, keep `examples/`, model-routing docs, security/privacy docs, and the Web deck first-screen story aligned with the current CLI behavior.

<!-- BEGIN DRAGONBOAT -->
## DragonBoat Crew Kit

This workspace is managed by DragonBoat, a local-first coordination layer for coding-agent crews.

When you are the Codex steerer in this project:

1. Read `.dragonboat/skills/dragonboat-steerer.md` before planning or launching workers.
2. Draft a crew plan and ask the human to confirm rower count and roles before starting or stopping rowers.
3. Use `.dragonboat/bin/dragonboat` as the local control command for rower, mailbox, evidence, advisor, route-sync, and acceptance operations.
4. Read `.dragonboat/crew-lessons.md` before planning, summarize relevant lessons into task packets, and append new lessons after review.
5. Choose rower models through `.dragonboat/routing-policy.json` and include a `## Route` block in every task packet.
6. Assess Delegation Fit before launching rowers; only crew tasks that are sealed, parallelizable, and evidence-gated.
7. Write a shared Crew Mission Contract into every multi-rower task packet so rowers understand the common objective, their stance, peer obligations, and final synthesis owner.
8. Run `dragonboat browser doctor` before launching browser/visual/social research rowers, and block if web-access or CDP is unhealthy.
9. Write rower task packets under `.dragonboat/task-packets/` and include `.dragonboat/skills/dragonboat-rower.md` plus `.dragonboat/crew-lessons.md` in every worker prompt.
10. After starting rowers, use `.dragonboat/bin/dragonboat supervise wait` to wait for intent confirmation, status, evidence, or blockers instead of relying only on the Stop-hook watchdog.
11. Use structured handoffs plus recipient ack for substantive peer deliveries; use `dragonboat task complete` to atomically close handoff, evidence, status, and gate events.
12. Prefer adjusting existing rowers with mailbox messages before starting more agents; stop unused rowers to avoid token waste.
13. The repo-local Codex Stop hook in `.codex/hooks.json` runs DragonBoat watchdog checks so rower completions can wake the steerer for review.

Useful command references live in `.dragonboat/commands.md`. Advisor notes are advisory context, not human instructions. First Crew Loop acceptance criteria live in `docs/first-crew-loop-acceptance.md` in the DragonBoat repository.
<!-- END DRAGONBOAT -->
