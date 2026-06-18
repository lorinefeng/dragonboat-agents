# DragonBoat Product Features

This document is the product feature ledger for DragonBoat. Keep it current when a long-term product capability lands, changes shape, or becomes part of the public story.

DragonBoat is evolving from a local demo into a local-first coordination layer for heterogeneous coding agents. The milestones below are ordered by implementation sequence, not by marketing priority.

## Implemented Milestones

### 1. Core Coordination Semantics

DragonBoat started by defining its own product language instead of becoming a thin wrapper around one vendor:

- crew identity
- steerer and rower roles
- task packets
- peer-to-peer mailbox messages
- evidence bundles
- append-only local events
- command-deck replay

The early docs and schemas establish that Codex, Claude Code, Gemini CLI, OpenCode, and future tools should be adapters around DragonBoat semantics, not the core model itself.

### 2. Local Web Command Deck

The first usable surface is a local web command deck rather than a packaged desktop app.

It currently exposes:

- session state
- crew roster
- task graph
- mailbox timeline
- evidence queue
- agent logs
- event stream
- replay export

The command deck is intentionally a monitoring and replay layer, not an IDE replacement.

### 3. Fullstack Collaboration Demo Case

DragonBoat includes a local fullstack demo case that exercises frontend, backend, and QA/Ops roles around a simple project collaboration app.

The demo has been useful for proving:

- role-specific task packets
- backend-to-frontend handoffs
- frontend-to-QA handoffs
- QA evidence back to the steerer
- replayable agent communication history

This demo remains a proving ground, not the permanent product boundary.

### 4. Agent Relationship Graph

The command deck now centers the crew graph as the primary first-screen surface.

Implemented behavior:

- dynamic steerer and rower nodes from session state
- steerer-to-rower command edges
- rower-to-rower peer edges
- draggable node positions saved in local storage
- edge hover and pinned message previews
- steerer history popover
- smooth Bezier edges for a less rigid workflow feel

This makes DragonBoat visually about relationships, coordination, and message flow rather than generic terminal output.

### 5. Branded Command Deck Visual System

The current web deck has a DragonBoat-specific identity:

- custom wordmark assets
- light and dark themes
- Codex and Claude icon assets
- steerer drum motif
- rower paddle motif
- water-wave graph background
- dark-theme wordmark variant

The visual direction is deliberately local-first, sharp, Chinese-culture-aware, and serious enough for real engineering.

### 6. Local Session Rail And Workspace Selection

DragonBoat now treats each run as a local session.

Implemented behavior:

- session creation
- session deletion
- active session selection
- persisted run summaries
- native macOS folder chooser for workspace tracking
- per-session local run directories under `.dragonboat/runs/<run_id>/`

This shifted the product away from a static demo page and toward a real local command deck.

### 7. Terminal Mirror

The command deck includes read-only agent terminal mirrors.

Implemented behavior:

- backend PTY hosting for rower processes
- terminal buffer replay
- live terminal drawer/modal
- draggable terminal surface
- per-agent CLI mirror buttons

The first implementation uses a built-in PTY path rather than external `tmux`, `ttyd`, or GoTTY.

### 8. Foreground Codex Steerer

DragonBoat changed direction from background-hosting the Codex steerer to preserving the native Codex CLI experience.

Implemented behavior:

- `dragonboat steer`
- foreground `codex -C <workspace>`
- session registration through the local API
- injected `DRAGONBOAT_RUN_ID`, `DRAGONBOAT_WORKSPACE_ROOT`, and `DRAGONBOAT_API_URL`
- terminal observation of Codex model and effort changes

This keeps the expensive flagship steerer in the native CLI where the user already has power features, while DragonBoat watches and coordinates around it.

### 9. Bootstrap Kit For Project Workspaces

`dragonboat init` and `dragonboat steer` install a local `.dragonboat/` kit into the tracked workspace.

The kit includes:

- steerer skill
- rower skill
- local command reference
- workspace-local DragonBoat shim
- task packet directory
- handoff directory
- evidence directory
- managed `AGENTS.md` block

This gives the foreground Codex steerer a concrete toolbox and instruction set inside the project it is steering.

### 10. Dynamic Claude Rower Control

The DragonBoat CLI and backend now support dynamic rower lifecycle control.

Implemented commands:

- `dragonboat rower start`
- `dragonboat rower stop`
- `dragonboat message send`
- `dragonboat message broadcast`
- `dragonboat evidence submit`
- `dragonboat config set`

The backend hosts Claude Code rowers and projects lifecycle changes into crew, task, terminal, mailbox, evidence, and session state.

### 11. Isolated Rower Worktrees

Dynamic rowers run in DragonBoat-managed isolated worktrees.

Implemented behavior:

- rower-specific worktree directory
- workspace overlay before rower startup
- exclusion of heavy/runtime directories
- bootstrap kit copied into worker context
- rower work kept separate from the foreground steerer workspace

This supports safer parallel work and reviewable handoffs.

### 12. Mailbox And Evidence Projection

Mailbox and evidence are now live product surfaces, not just abstract docs.

Implemented behavior:

- API endpoints for session-scoped mailbox messages
- broadcast messages
- evidence submission
- task status projection from evidence
- task status projection from crew lifecycle
- terminal mirror echoes for message delivery
- rejection of blank handoffs

The current product expectation is evidence before claims.

### 13. Claude Route Health Checks

DragonBoat checks Claude Code route health before launching a rower.

Implemented behavior:

- minimal Claude route probe
- provider error capture
- token-waste prevention before full rower startup
- blocked rower and task projection
- command output projection
- blocker mailbox entry

This prevents unhealthy model/provider routes from silently burning a worker attempt.

### 14. Per-Agent Runtime Configuration

DragonBoat stores per-run agent model and effort settings.

Implemented behavior:

- `.dragonboat/runs/<run_id>/agent-config.json`
- graph-node model and effort controls
- Codex route sync from native terminal status line
- live PTY slash-command injection for running agents
- startup argument injection for canonical Claude rowers

This is the first version of user-owned model routing.

### 15. Capability-Aware Rower Routing

DragonBoat now routes rowers by task capability, not just speed or cost.

Implemented behavior:

- `.dragonboat/routing-policy.json`
- `dragonboat route recommend`
- `dragonboat route set`
- task packet `## Route` parsing
- Chinese route hint parsing, such as `-划手职责:前端设计/接口对接` and `-模型:kimi-k2.6`
- route-driven Claude startup model and effort
- route-driven health check model and effort
- route decisions recorded as `route.decision.recorded` events with agent id, role, model, effort, required capabilities, reason, fallback, task id, and source
- event stream formatting for route decisions so model choices are visible in replay/debug surfaces

Current default policy:

- `glm-5.1` for low-cost text/code work
- `kimi-k2.6` for multimodal work such as frontend design, screenshot review, UI QA, and visual judgment

This makes DragonBoat’s model routing explainable, auditable, and aligned with user-owned cost control.

### 16. First Crew Loop Acceptance Gate

DragonBoat now has a scriptable acceptance gate for the first real self-iteration run.

Implemented behavior:

- `dragonboat acceptance first-crew-loop --events <events.ndjson>`
- no-argument active run resolution through `DRAGONBOAT_RUN_ID`
- `--run <run_id>` and `--latest` local run resolution
- local API fallback when an older server process has events in memory but no per-run event file
- JSON event-record and NDJSON event parsing
- ordered dynamic rower registration check
- rower task packet check
- Claude command-start check
- required backend-to-frontend, frontend-to-QA, and QA-to-steerer mailbox checks
- non-empty mailbox body checks for required handoffs
- explicit `--from` and `--task` guidance for rower-originated mailbox handoffs
- per-rower evidence submission checks
- per-rower `evidence.gate.checked` reviewable checks for backend, frontend, and QA/Ops evidence
- rower stop lifecycle check
- human-readable PASS/FAIL checklist output
- workspace-local session state and event files under `.dragonboat/runs/<run_id>/`
- durable mailbox rules in the bootstrap rower and steerer skills
- canonical backend/frontend/QA prompt guardrails injected during `rower start`
- rower worktree handoff/evidence file sync back to the tracked workspace on process exit
- a real self-iteration run, `run_2026-05-24T08_53_56Z`, passed the gate after backend, frontend, and QA/Ops rowers submitted required mailbox/evidence records and the steerer explicitly stopped a rower
- a golden-path unit test now verifies that the acceptance validator recognizes a complete dynamic backend/frontend/QA crew loop with lifecycle stop

This turns the first real crew-loop milestone from a subjective visual review into a repeatable event-ledger gate. The gate now follows the submitted -> reviewable truth model instead of treating raw evidence submission as enough.

The demo API now defaults to workspace-local per-session event files instead of forcing every server run into `run_demo_web_loop/events.json`; explicit `DRAGONBOAT_EVENT_RECORD_PATH` still works for one-off debugging.

### 17. Advisor Channel V0

DragonBoat now has a minimal external advisor channel for steering input that should not masquerade as a human command.

Implemented behavior:

- `dragonboat advisor send --kind advice|research|risk --body <text> [--source <path-or-url>]`
- `dragonboat advisor inbox [--limit <count>]`
- session API endpoint `POST /api/sessions/:runId/advisor`
- local event type `advisor.message.sent`
- mailbox projection as `advisor -> agent_codex`
- UI visibility through mailbox timeline and event stream
- no `human.input.submitted` event and no Web-to-Codex stdin injection

This gives the project owner or an external research agent a way to send suggestions, research, and risks to the foreground steerer without pretending to be the user.

### 18. Mailbox/Evidence Guardrail V0

DragonBoat now enforces the first product-level coordination constraint for canonical rowers.

Implemented behavior:

- backend evidence for `task_backend` is rejected until `agent_backend -> agent_frontend` sends a non-empty `contract` mailbox message
- frontend evidence for `task_frontend` is rejected until `agent_frontend -> agent_qa_ops` sends a non-empty `status`, `review`, or `evidence` mailbox message
- QA/Ops evidence for `task_qa_ops` is rejected until `agent_qa_ops -> agent_codex` sends a non-empty `evidence` or `review` mailbox message
- non-canonical/ad hoc rowers are not forced into the first-crew-loop guardrail shape

This turns “rowers should communicate before claiming done” from a prompt convention into a backend API constraint.

### 19. Context Bundle V0

DragonBoat now has a first provider-neutral context bundle for cross-platform adapter handoff.

Implemented behavior:

- shared `dragonboat.context_bundle.v0` bundle builder
- Markdown formatter for agent-readable delivery
- JSON schema at `schemas/v0/context-bundle.schema.json`
- session API endpoint `GET /api/sessions/:runId/context-bundle?agentId=<agentId>&taskId=<taskId>`
- CLI command `dragonboat context bundle --agent <agentId> [--task <taskId>] [--format markdown|json]`
- recipient identity, task context, crew roster, relevant mailbox, advisor notes for the steerer, agent logs, recent events, evidence, constraints, and adapter hints
- fallback task context when an adapter asks for a task before it has been fully projected into the run state
- bootstrap command reference and steerer/rower skills updated to prefer bundles over raw transcript copying when handing state across agents

This is DragonBoat's first concrete step toward a real adapter layer. It absorbs the useful lesson from context-transfer tools while keeping the core payload based on DragonBoat's own crew/task/mailbox/evidence semantics.

### 20. Replay Launch Artifact V0

DragonBoat replay export now has a first launch-story layer instead of only showing raw communication events.

Implemented behavior:

- replay timeline positioning: `DragonBoat is a crew coordination layer, not an agent wrapper.`
- launch chapters for steerer, dynamic rowers, model routing, mailbox, evidence, and acceptance
- `route.decision.recorded` events become visible replay stages with model, effort, and reason
- Remotion video renders a chapter strip that shows which coordination capability has appeared in the event stream
- intro copy now frames the video as a crew coordination replay rather than a generic fullstack demo
- replay data tests verify that the launch narrative includes crew coordination positioning and route decisions

This makes the MP4 export a product explanation artifact: viewers should be able to see who decided, who executed, what model route was chosen, what was handed off, what evidence was submitted, and how the steerer accepted the run.

### 21. Replay Launch Acceptance Gate

DragonBoat now has a scriptable gate for checking whether a replay artifact contains the minimum public launch story.

Implemented behavior:

- `dragonboat acceptance replay-launch --events <events.ndjson> --video <path-to-mp4>`
- support for the same `--run`, `--latest`, and active `DRAGONBOAT_RUN_ID` event-source resolution used by First Crew Loop acceptance
- optional MP4 existence check when `--video` is provided
- validation that the replay source contains a foreground steerer, a dynamic Claude rower, a task packet, a route decision, mailbox communication, evidence submission, and steerer review
- validation that replay data still carries the product positioning `DragonBoat is a crew coordination layer, not an agent wrapper.`
- validation that the six launch chapters exist: steerer, dynamic rowers, model routing, mailbox, evidence, and acceptance
- CLI PASS/FAIL output suitable for foreground Codex steerer review or release checklist automation

This turns the replay from a subjective design artifact into a product-story acceptance gate.

### 22. Crew Lessons V0

DragonBoat now installs a shared workspace lesson file so steerer and rowers can carry practical run experience into future task packets.

Implemented behavior:

- bootstrap installs `.dragonboat/crew-lessons.md` from `docs/crew-lessons-template.md`
- the lesson file is created only when missing, so real workspace lessons are not overwritten by later `dragonboat init` or `dragonboat steer`
- `dragonboat doctor` treats the shared lesson file as part of the required bootstrap kit
- the managed `AGENTS.md` block tells the steerer to read lessons before planning, summarize relevant lessons into task packets, and append new lessons after review
- steerer and rower skills both require reading `.dragonboat/crew-lessons.md`
- `.dragonboat/commands.md` documents the lesson workflow
- the initial template captures the first hard-learned UI/UX lesson: frontend work requires live local preview, screenshot evidence, operation paths, and main-workspace visibility proof before ready-for-QA handoff

This turns collaboration improvement from an oral reminder into a shared, durable operating memory for the local crew.

### 23. Readable Rower Projection And Session Rail UX Pass

DragonBoat now separates rower audit data from the default rower reading experience in the command deck.

Implemented behavior:

- raw `command.output`, terminal buffers, and event-ledger records stay intact for audit and replay
- a shared readable-projection helper derives user-facing rower output from Claude stream-json without pushing raw JSON parsing into React components
- default rower output panels now prefer readable assistant content with basic Markdown rendering and a distinct final-summary section
- tool-use, tool-result, usage, session metadata, and similar stream noise remain available in raw/debug surfaces without dominating the default view
- the left session rail now supports collapse/expand, hover metadata tooltip, and graph recentering after collapse
- React tests cover readable-output default behavior plus session tooltip and collapse interactions

This shifts the command deck closer to what a steerer actually needs during review: what each rower is doing, what it finished, whether it is blocked, and what summary it produced, while still preserving the underlying evidence trail.

### 24. Steerer Watchdog V0

DragonBoat now mounts a repo-local Codex Stop hook so a foreground Codex steerer can be woken after rowers finish work.

Implemented behavior:

- `dragonboat init` and `dragonboat steer` install `.codex/hooks.json` into the tracked workspace
- the hook calls `.dragonboat/bin/dragonboat watchdog stop-check`
- `watchdog stop-check` reads local `.dragonboat/runs/<run_id>/events.ndjson` and `.dragonboat/runs/<run_id>/watchdog-state.json`
- the watchdog does not require the local web/API server to be reachable for the Stop-hook decision
- new mailbox to `agent_codex`, blocker mailbox, rower evidence, and rower lifecycle `done|blocked|stopped` can trigger a Codex continuation
- repeated stale pending windows are suppressed through `stop_hook_active`, pending signatures, and watchdog cursor state
- every continuation writes `watchdog.continuation.recorded` into the local event ledger
- `dragonboat steer` now resumes a running session for the same workspace when available, so restarting the foreground Codex CLI can keep the active DragonBoat run context
- `dragonboat doctor` verifies that the repo-local Stop hook is installed

This closes a real product gap discovered in self-use: a foreground steerer should not have to wait for the human's next prompt to notice that rowers submitted evidence or completed work.

### 25. Delegation Economics V0

DragonBoat now has a first product mechanism for deciding whether a task should become an agent-team task.

Implemented behavior:

- `dragonboat delegate assess` scores context amortization, parallel split, interface stability, acceptance executability, low-cost rower fit, shared-state penalty, and runtime-drift penalty
- hard blockers force `single_agent_default` even when numeric score is high
- `dragonboat delegate packet` generates a sealed Markdown task packet with fit snapshot, sealed inputs, allowed scope, acceptance checks, evidence requirements, and escalation rules
- `dragonboat evidence submit` remains backward-compatible while accepting structured proof fields such as files, touched paths, commands, workspace proof, risks, screenshots, and task type
- `dragonboat evidence gate` checks whether submitted evidence is actually reviewable, including mailbox-before-evidence, acceptance proof, tracked workspace visibility, risk disclosure, and task-specific UI/runtime/backend-contract rules
- `dragonboat benchmark record` derives local run economics from event ledgers and writes `.dragonboat/benchmarks/<benchmark_id>.json`
- `dragonboat benchmark compare` compares solo and crew records by premium token ratio, wall-clock time, false-done count, and outcome
- new event types make the workflow auditable: `delegation.fit.assessed`, `sealed.task_packet.created`, `evidence.gate.checked`, and `benchmark.recorded`
- docs and bootstrap skills now instruct steerers to avoid crew launches when the task is low-fit or cannot be sealed

This shifts DragonBoat from “launch more agents” toward “launch rowers only when the economics and verification contract justify the coordination cost.”

### 26. Crew Mission Contract And Supervision Loop V0

DragonBoat now has a first coordination protocol for multi-rower work that should behave like a team instead of several isolated workers.

Implemented behavior:

- sealed task packets can include a `Crew Mission Contract`
- mission contract fields cover shared mission, final synthesis owner, role stance, non-goals, required peers, and intent confirmation
- `intent_confirmed` mailbox type records that a rower understands the shared mission before substantive work
- `peer_challenge` mailbox type records cross-rower challenge or alignment for multi-perspective tasks
- `dragonboat supervise wait` lets the foreground steerer wait for rower milestones such as intent confirmation, status, and evidence
- supervision results write `supervision.wait.completed`, `supervision.wait.timeout`, or `supervision.wait.blocked` events
- steerer and rower skills now state that the Stop-hook watchdog is not live supervision
- crew lessons now warn that parallel review requires shared mission and peer challenge

This addresses a concrete failure from self-use: a parallel review crew can otherwise produce three local reports without shared synthesis, peer disagreement, or live correction. DragonBoat now has a minimum protocol for rowers to confirm purpose, challenge peers, and keep the steerer awake while the crew is still active.

### 27. User-Level DragonBoat Command Shim

DragonBoat now has a first user-level entrypoint for arbitrary project workspaces.

Implemented behavior:

- `dragonboat install-command` installs a command shim to a chosen target path, such as `/opt/homebrew/bin/dragonboat`
- the shim delegates to the current DragonBoat CLI entrypoint without requiring the target project to contain `./bin/dragonboat.mjs`
- after installation, the owner can run `dragonboat init`, `dragonboat doctor`, and `dragonboat steer` from any workspace directory
- project bootstrapping still installs the workspace-local `.dragonboat/bin/dragonboat` shim for steerer and rower task packets
- the CLI usage and bootstrap command reference now document the global command path and the local fallback

This closes a real usability gap: DragonBoat should follow the user into a project folder, not force the project folder to know where the DragonBoat repository lives.

### 28. Workspace-Local Watchdog Hook For Nested Projects

DragonBoat now handles projects that live inside a larger Git repository.

Implemented behavior:

- generated `.codex/hooks.json` Stop hooks call the current workspace's `.dragonboat/bin/dragonboat` directly
- watchdog hooks pass `--workspace <path>` explicitly instead of inferring the workspace from `git rev-parse --show-toplevel`
- `dragonboat init` replaces older git-root-based watchdog hooks with the workspace-local hook
- `dragonboat doctor` now reports stale hooks that still contain `git rev-parse` or do not point at the current workspace shim

This fixes nested workspace failures where a project such as `.../yijia_AIGC/HomeScene_Agent` belongs to a parent Git repo, but DragonBoat state lives under the nested project directory.

### 29. Crew Mailbox Type Alignment Hotfix

DragonBoat now accepts the mailbox types that its own crew skills and task packets ask rowers to use.

Implemented behavior:

- the Hono API mailbox validator accepts `intent_confirmed`, `peer_challenge`, and `worklog`
- API tests cover rower-originated `intent_confirmed` and peer-to-peer `peer_challenge` messages
- CLI tests cover explicit `--from`, `--task`, and `--type peer_challenge` forwarding

This fixes a real runtime failure from the HomeScene Agent research run: rowers were instructed to confirm shared intent and challenge peers, but the API rejected those newer coordination message types. The product lesson is that message-type contracts must be shared across schema/types, API validation, CLI docs, and bootstrap skills before a crew run relies on them.

### 30. Browser Research Readiness V0

DragonBoat now has a first opt-in browser research readiness path for rowers that need real pages, screenshots, and multimodal visual observation.

Implemented behavior:

- `web-access` can be installed as a Claude Code user-scope plugin for selected rowers
- `dragonboat browser doctor` checks local artifact writability, Node.js 22+, Claude Code plugin visibility, web-access dependency health, and CDP proxy health
- `dragonboat browser smoke` records a `kimi-k2.6 / max / browser_research` route decision, runs a Claude Code smoke rower, asks it to capture a browser screenshot, and submits browser research evidence
- route recommendation now treats `browser_research`, `dynamic_page_research`, `visual_research`, and `social_platform_research` as multimodal browser tasks and defaults them to `kimi-k2.6 / max / block_if_unhealthy`
- sealed task packets can include a `Browser Research Capability` section with allowed domains, source URLs, screenshot requirements, and blocker behavior
- Evidence Gate now distinguishes `research` and `browser_research` tasks from implementation tasks, so review-only research is not rejected for lacking touched code files while browser research still requires screenshots and browser/CDP commands
- local CLI mailbox/evidence commands can fall back to the workspace event ledger when the API is temporarily unreachable
- `dragonboat run reconcile` and server-side reconciliation preserve externally written local events and can broadcast them into the live command deck after the API reconnects
- the command deck caches the last good run snapshot so transient fetch failures do not immediately blank the crew graph

Current known gap: CDP still requires the user's Chrome/Edge remote debugging permission. DragonBoat must not bypass that browser security step; if the browser toggle is off, `browser doctor` reports a blocker and browser rowers should not launch.

### 31. Dynamic Workflow Readiness V0

DragonBoat now has a first substrate for staged dynamic workflows above the normal 3-5 rower Agent Team mode.

Implemented behavior:

- shared agentic mode router that can choose `single`, `subagent`, `agent_team`, `dynamic_workflow`, or `human_approval_required`
- mode routing still uses Delegation Economics scores, but adds task signals such as expected agent count, phase count, cross-check requirement, hidden complexity, max concurrency, and token estimate
- new workflow events: `agentic.mode.required`, `agentic.mode.assessed`, `agentic.mode.selected`, `workflow.plan.created`, `workflow.phase.started`, `workflow.phase.completed`, `workflow.agent.spawned`, `workflow.agent.stopped`, `workflow.control.requested`, `workflow.supervision.blocked`, and `workflow.acceptance.completed`
- provider-neutral Workflow Plan IR with goal, workspace, phases, quality patterns, max concurrency, max total agents, token/cost caps, and human approval gates
- default workflow phases: `discover`, `shard`, `fanout`, `cross_check`, `synthesize`, and `verify`
- default safety envelope: `max_concurrency=4` and `max_total_agents=24`; larger plans are rejected unless human approval is explicit
- CLI commands: `dragonboat workflow assess`, `workflow draft`, `workflow validate`, `workflow run` / `workflow run --dry-run`, and `workflow pause|resume|stop`
- live `workflow run` can spawn phase rower waves, observe pause/resume/stop controls, kill blocked or timed-out phase agents, retry phases with `--phase-retries`, and record the accepted truth event only after phase evidence gates pass
- Claim Ledger primitives for `claim.submitted` and `claim.reviewed`, including `unverified`, `supported`, `refuted`, `conflicted`, and `needs_human`
- CLI commands `dragonboat claim submit` and `dragonboat claim review` so rowers and refuters can write claim-ledger events without hand-editing the run file
- Evidence Gate v2 task type `workflow_claim`, which requires sourced claims, independent review, and exclusion of refuted claims from final synthesis
- Benchmark records now allow `agent_team` and `dynamic_workflow` modes in addition to the earlier `single_agent` and `crew` modes
- the command deck projects a compact Workflow Status panel showing current mode, active phase, active workflow agents, claim counts, evidence truth state, and phase statuses
- bootstrap command reference, steerer skill, rower skill, crew lessons, and `docs/dynamic-workflow-readiness.md` now explain that value comes from staged fan-out, refuters, claim voting, and cost/risk caps, not raw agent count

Current known gap: the first live phase runtime exists, but it is still a conservative local-API runner rather than a production-scale scheduler. Retry is count-based, resume is ledger-observed rather than a full persisted scheduler, and large workflows should still start with dry-run plus small smoke runs before high fan-out.

### 32. Agentic Economics And Workflow Control P1

DragonBoat now has a second layer of practical controls around Dynamic Workflow Readiness: route selection can account for subscription constraints, agent/model capability history can be summarized, cost waste can be traced, workflow plans can start from reusable packs, and benchmark comparisons can cover single, agent-team, and dynamic-workflow modes.

Implemented behavior:

- `dragonboat route budget` selects among candidate models using required capabilities, estimated tokens, per-subscription concurrency, remaining budget, per-task cost cap, and quality-risk tolerance
- `budget.route.assessed` events make budget-aware route decisions replayable and auditable
- `dragonboat capability matrix` derives Agent Skill Cards and model capability profiles from route decisions, evidence gates, and claim reviews
- `dragonboat cost trace` summarizes token/cost proxy entries and highlights blocked or wasted spend from the local run ledger
- Workflow Pack / Role Pack primitives provide reusable workflow templates for `pr_review`, `large_migration`, `frontend_multimodal`, and `security_audit`
- `dragonboat workflow pack list|show|install|draft` lets a steerer list reusable packs, install pack metadata into a workspace, or draft a provider-neutral workflow plan from a known pack
- `dragonboat benchmark suite` compares multiple benchmark records across `single_agent`, `crew`, `agent_team`, and `dynamic_workflow`, returning confidence and recommended mode instead of pretending one run proves economics
- new schemas cover budget routes, capability matrices, cost traces, workflow packs, and benchmark-suite reports
- workflow rower prompts now add a `Browser Research Capability` section when a phase route includes browser or visual research, forcing preflight and blocker behavior instead of silent fallback to terminal-only fetching
- the command deck Workflow Status panel now has a deeper projection: phase timeline, active agent waves, claim table, cost trace, browser evidence, final report truth state, and pause/resume/stop controls

Current known gap: the P1 controls are still local-ledger and CLI-first. Budget inputs are user/provider supplied, cost is often a proxy when provider usage is missing, and workflow controls write/request events before they become a full long-running scheduler UI.

## Current Known Gaps

DragonBoat should not overclaim the current state.

- The first real self-iteration run has passed, but this should be repeated across fresh workspaces before treating the path as release-stable.
- Steerer Watchdog v0 is mounted and can emit continuation decisions, but it still needs more fresh-session validation with real Codex hook execution, not only manual `watchdog stop-check` smoke tests.
- Delegation Economics v0 and P1 economics controls are CLI-first; the command deck now shows workflow cost/claim projection, but does not yet provide a full benchmark comparison dashboard.
- Crew Supervision v0 is CLI/event-ledger first; the command deck does not yet show supervision wait state or missing milestone warnings as a dedicated panel.
- Dynamic Workflow Readiness v0/P1 has a workflow plan IR, claim ledger primitives, CLI dry-run, a first live phase runner, reusable workflow packs, and deeper command-deck projection; it still needs richer scheduler persistence, backoff, and large-run stress testing.
- Advisor-to-steerer communication now exists as a minimal side channel, but still needs richer UI affordances and steerer workflow hardening.
- Mailbox/evidence compliance now has a first canonical API guardrail, but still needs expectation tracking, richer error recovery, and force/override semantics for unusual workflows.
- Context Bundle v0 exists, but provider-specific import/export adapters beyond Codex steering Claude Code are still early.
- Replay Launch Artifact v0 has a first acceptance gate, but should still be visually reviewed against a real exported MP4 before using it as public launch material.
- Crew Lessons v0 exists as a mutable workspace file, but it still depends on the steerer appending concise lessons after each real run.
- The user-level command shim currently points at the local development worktree; packaging should later replace this with an npm/Homebrew-style install story.
- Browser-based research is now an opt-in route capability, but it still depends on user-enabled Chrome/Edge CDP permission and should be validated with `browser doctor` before launching visual or social-commerce rowers.

## Product Advantages To Preserve

- Local-first orchestration.
- Cross-platform semantics before vendor-specific adapters.
- Native CLI respect instead of replacing the user’s agent tools.
- Dynamic crew size instead of fixed one-plus-three templates.
- Peer mailbox and evidence as first-class product concepts.
- Steerer watchdog continuation for native foreground CLI workflows.
- Delegation economics for deciding when agent teams are actually worth using.
- A user-level `dragonboat` command so arbitrary folders can become DragonBoat workspaces without repo-relative paths.
- Shared mission contracts and live supervision so multi-rower work behaves more like a team.
- Capability-aware model routing controlled by the user.
- Visual replay and command-deck observability.
- Chinese cultural identity with open-source international reach.

## Suggested Next Feature Directions

### 1. Repeatable First Crew Loop Hardening

The first complete real DragonBoat self-iteration run has passed once. The next reliability step is to make that result repeatable without manual intervention.

The hardened path should keep proving:

- foreground Codex steerer drafts a crew plan
- user confirms the plan
- backend rower starts dynamically
- backend submits contract handoff and evidence
- frontend rower starts only when needed
- frontend consumes backend handoff and submits status/evidence
- QA/Ops rower verifies and submits final evidence
- steerer stops at least one rower
- web graph, terminal mirror, mailbox, task graph, and evidence queue all match reality

This remains the most important reliability area before adding more surface area.

### 2. Advisor Channel Hardening

The first explicit channel for an external advisor agent now exists. Next, harden it so the foreground steerer naturally uses it without confusing it with human intent.

The advisor should be able to:

- send product insight to the steerer
- attach source links and research notes
- recommend next task packets
- flag route choices or missing evidence
- request the steerer to ask the user for confirmation when needed

This channel is now visible in mailbox/event surfaces and recorded in the event log; the next step is making it more ergonomic and reviewable.

### 3. Advisor Research Pipeline

Turn product research into an auditable artifact.

The advisor should periodically or manually produce:

- market notes
- competitor deltas
- feature opportunities
- recommended DragonBoat iteration prompts
- risk notes

This should feed the Advisor Channel, not bypass the steerer.

### 4. Stronger Mailbox Guardrails

Rower coordination should become harder to skip.

Potential implementation:

- task packet required handoff checklist
- mailbox expectation tracker
- missing handoff warnings
- evidence cannot be accepted until required messages exist
- rower stop blocked when required evidence is absent unless explicitly forced

This turns “please communicate” into an enforceable workflow.

### 5. Provider Adapter Layer

Use Context Bundle v0 as the common payload while formalizing adapter boundaries for different CLI-based agents.

Near-term targets:

- Claude Code hooks and subagent lifecycle events
- Codex foreground session observation and advisor injection
- Gemini CLI or Antigravity-style subagent semantics
- OpenCode/OpenClaw-style command adapters later

DragonBoat should keep the same crew/task/mailbox/evidence semantics while adapters differ.

### 6. Browser Research Capability

Selected rowers should be able to use a real browser when terminal fetches are the wrong observation layer.

The first candidate is the `web-access` Claude Code skill/plugin, documented in `docs/adapters/web-access.md`.

Near-term targets:

- route capability: `browser_research`
- steerer packet section for allowed domains, browser choice, screenshots, and safety constraints
- preflight check before launching a browser rower
- screenshot/source artifacts in evidence gate for browser-research tasks
- opt-in activation only for visual, product-page, and social-platform research rowers

This should help DragonBoat handle dynamic product pages, visual benchmark work, and image-heavy platform research without pretending WebSearch/WebFetch is enough.

### 7. Replay As Launch Artifact

Make replay export good enough to explain DragonBoat publicly.

A strong replay should show:

- crew plan
- dynamic rower creation
- model route decisions
- mailbox messages between agents
- evidence checkpoints
- steerer acceptance
- final “what shipped” summary

This is not just polish. It is how users understand why DragonBoat is not another agent wrapper.

## External Signals Behind The Next Direction

Recent agent products are converging on specialized agents, hooks, worktree isolation, and explicit lifecycle events:

- Claude Code supports custom subagents, subagent lifecycle hooks, and project-level hook events.
- Gemini CLI documents specialist subagents with independent context windows and tool scopes.
- Vibe Kanban emphasizes parallel coding agents, isolated worktrees, code review, and conversation reliability.
- Codex and AGENTS.md references highlight the importance of instruction files, repeatable configuration, and project-local agent context.
- Recent research on Claude Code argues that much of an agent system’s value lives around the model loop: permissions, compaction, extensibility, subagents, worktrees, and append-oriented session storage.
- Recent overeagerness research suggests permissive coding agents can act outside scope, which makes DragonBoat’s plan confirmation, mailbox, evidence, and stop/accept gates strategically important.

The product implication is clear: DragonBoat should not compete by merely launching more agents. It should win by making heterogeneous agent work observable, bounded, routed, reviewable, and replayable.

Representative references:

- Anthropic Claude Code subagents: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Anthropic Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Gemini CLI subagents: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md
- Vibe Kanban workspaces: https://vibe-kb.com/docs/workspaces/
- OpenAI Codex workflow example: https://cookbook.openai.com/examples/codex/codex_mcp_agents_sdk/building_consistent_workflows_codex_cli_agents_sdk
- Overeager coding agents study: https://arxiv.org/abs/2605.18583

## 2026-05-30 — P2 Agent Compute Economics

DragonBoat now has the first local CLI substrate for privacy-aware and cost-aware agent compute routing.

Implemented user-facing capabilities:

- `dragonboat compute plan` evaluates local and remote workers against capability, privacy, trust-zone, concurrency, cost, and latency constraints.
- `dragonboat privacy route|scan|redact` checks secrets and local-only policy before a steerer sends file content to cloud or remote workers.
- `dragonboat subscription advise` turns subscription inventory plus traces into keep/downgrade/cancel/upgrade/shift-to-local recommendations.
- `dragonboat marketplace list|show|install` introduces a local auditable pack interface for community role packs, workflow packs, tool gateways, eval suites, and adapters.
- `dragonboat capability learn` derives long-run prefer/avoid/probe-more signals from route decisions and evidence-gate outcomes.

Implemented data contracts:

- `compute.placement.planned`
- `privacy.route.assessed`
- `subscription.advice.generated`
- `marketplace.pack.installed`
- `capability.learning.updated`
- `schemas/v0/compute-placement.schema.json`
- `schemas/v0/privacy-route.schema.json`
- `schemas/v0/subscription-advice.schema.json`
- `schemas/v0/marketplace-pack.schema.json`
- `schemas/v0/trace-learning.schema.json`

User-facing value:

- Private code can be blocked or held for human approval before leaving local machines.
- Secret-bearing content can be redacted before cloud routing.
- The owner can start comparing model subscriptions and local/remote worker economics from actual DragonBoat traces.
- Community extensions become inspectable local manifests instead of hidden package magic.
- Historical run traces can begin to inform routing choices without silently replacing human control.

Known gaps:

- Compute worker inventory is still explicit JSON, not discovered from Docker, SSH, GitHub Actions, or Kubernetes.
- Marketplace install is a manifest copy, not a signed remote install pipeline.
- Subscription advice is advisory and trace-dependent; it is not procurement automation.
- Trace learning does not yet mutate `.dragonboat/routing-policy.json`; the steerer must interpret the recommendations.

## 2026-06-02 — Crew Control Plane Stability Pass

DragonBoat now has a sturdier control-plane fallback for real cross-workspace crew runs.

Implemented user-facing capabilities:

- `dragonboat message send` and `message broadcast` materialize API-down mailbox instructions into `.dragonboat/runs/<run_id>/inbox/<agentId>/*.md` instead of only recording non-injected ledger events.
- Session message injection through the API also writes a local inbox fallback when the target rower PTY is not running.
- Local CLI event writes refresh `.dragonboat/runs/<run_id>/state.json`, reducing stale `activeAgentCount` and phase drift after rowers finish.
- CLI commands now honor `DRAGONBOAT_WORKSPACE_ROOT` for active run events, mode assessments, rower startup gates, claim events, and workflow controls when invoked from nested project directories.
- Dynamic rower worktrees are created under the tracked workspace's `.dragonboat-worktrees/<run_id>/<agentId>/` rather than the DragonBoat API process directory.

User-facing value:

- The steerer can still send durable instructions when the local API is down or a rower terminal is temporarily unavailable.
- Rower agents have a concrete pollable inbox, which makes offline handoff recovery possible.
- External project workspaces no longer accidentally leak rower worktrees or agentic-mode events back into DragonBoat's own demo worktree.
- The command deck is less likely to show a stale active-agent count after rower lifecycle events land through local CLI paths.

Known gaps:

- The inbox fallback is a file queue, not a guaranteed real-time PTY injection.
- Rower skills tell agents to poll inboxes, but automatic rower-side inbox polling is not yet enforced by runtime.
- `events.ndjson` still uses the existing JSON envelope format; a true append-only NDJSON migration remains separate.

## 2026-06-03 — Structured Handoff Ack And Atomic Task Completion

DragonBoat now has the first semantic handoff layer for making agent-to-agent delivery consumable, not merely visible.

Implemented user-facing capabilities:

- `dragonboat handoff submit` records a structured peer delivery with summary, claims, sources, confidence, open questions, required recipient action, artifact path, and optional ack requirement.
- `dragonboat handoff ack` records that a recipient has read, consumed, or questioned a handoff.
- `dragonboat handoff list --pending` shows ack-required structured handoffs that still need recipient consumption.
- `dragonboat task complete` gives rowers a single closure command that writes the structured handoff, evidence submission, evidence-gate check, task status, and crew member status in one sequence.
- `task.completed` is now emitted only when Evidence Gate returns `reviewable`; rejected evidence keeps the task and rower in `blocked` state with failed check ids recorded for steerer review.
- Session APIs now support structured handoff submission, handoff acknowledgement, and task completion so future command-deck UI can project the same semantic state.
- Evidence Gate now treats structured handoffs as durable mailbox proof, but rejects ack-required handoff evidence until the recipient records an ack.
- Bootstrap steerer and rower skills now instruct agents to prefer structured handoffs for substantive peer deliveries and reserve plain mailbox messages for short instructions, worklogs, and challenges.

User-facing value:

- The steerer can see which deliveries are merely sent and which have actually been consumed.
- Downstream rowers can consume compact handoff fields instead of re-reading long Markdown reports.
- A rower completion is less likely to split across mismatched handoff files, evidence files, lifecycle events, and stale task status.
- This directly targets the observed 7/10 Agent Team weakness: DragonBoat already parallelizes work, but now starts reducing the cost and ambiguity of information transfer between rowers.

Known gaps:

- Ack is still explicit and manual; DragonBoat does not yet auto-detect that a recipient truly used the handoff.
- `task complete` records a closure sequence, but human or steerer acceptance remains a separate decision even after Evidence Gate marks an artifact reviewable.
- The web command deck can project the new events through existing ledgers, but it does not yet have a dedicated shared-facts board or pending-handoff dashboard.
- Structured handoffs are not yet converted into incremental context bundles automatically.

## 2026-06-03 — Shared Fact Board, Native Efficiency Metrics, And Context Delta

DragonBoat now has a first shared-facts layer for turning many rower reports into a steerer-consumable truth board.

Implemented user-facing capabilities:

- `dragonboat fact board` derives a shared fact board from the run ledger, separating confirmed facts, unverified claims, conflicting claims, missing evidence, pending handoffs, and accepted conclusions.
- `dragonboat context delta --to <agentId> --since <seq>` gives a rower only the new facts, conflicts, pending handoffs, open questions, and artifact paths added since a sequence number.
- Shared fact board projection now understands legacy/current run signals such as `mailbox.message.sent`, `evidence.submitted`, and `crew.member.status_changed`, so earlier real crew runs no longer appear empty simply because they did not emit first-class `fact.*` events.
- Pending handoffs preserve their intended recipient, allowing context delta to become recipient-centered instead of only global-run centered.
- Instruction and `intent_confirmed` mailbox traffic is filtered out of pending handoff projection so task packets and acknowledgements do not drown out substantive deliveries.
- Benchmark records now include native efficiency metrics: `team_wall_clock_seconds`, `serial_lower_bound_seconds`, `rower_self_estimate_seconds`, `hard_telemetry_seconds`, `soft_estimate_seconds`, and `confidence_level`.
- The benchmark `wall_clock_seconds` field remains backward-compatible but now prefers hard rower command telemetry when available.
- Benchmark records can derive soft estimates from delivered handoff/evidence Markdown artifacts, including estimated solo minutes and reread-penalty minutes, while deduplicating same-basename handoff/evidence pairs.
- New schemas document `shared-fact-board`, `context-delta`, and the benchmark native efficiency fields.
- CLI and bootstrap command docs expose shared fact board and context delta commands so foreground Codex steerers can use them during real crew runs.

User-facing value:

- The steerer no longer has to manually merge every rower handoff before seeing which facts are supported, disputed, or missing proof.
- Follow-up rowers can consume incremental state instead of rereading long packets and old handoffs.
- DragonBoat can report conservative hard telemetry separately from softer rower self-estimates, making speedup claims less hand-wavy.
- Existing real run ledgers can be re-audited after the fact, which is important while DragonBoat is still transitioning from Markdown-heavy handoffs to first-class semantic events.
- This directly supports repository-capability review tasks where parallel rowers are useful but final synthesis still needs a single shared reality.

Known gaps:

- The shared fact board is CLI-first; the web command deck does not yet render it as a dedicated panel.
- Fact extraction now has a read-side compatibility layer for older mailbox/evidence/lifecycle events, but the stronger long-term path is write-side structured semantics and sidecar JSON for handoffs/evidence.
- Accepted conclusions still require explicit claim/review or acceptance events; DragonBoat should not infer final truth solely from a rower reaching `done`.
- Context delta does not yet write a recipient ack automatically after consumption.
- Benchmark economics still require token/cost data or proxy fields before claiming cost savings, not just time savings.

## 2026-06-05 — Run Ledger Resilience And Artifact Directory Readiness

DragonBoat now hardens the local run ledger against partial event-envelope reads and ensures new run directories expose the artifact surfaces rowers and steerers expect.

Implemented user-facing capabilities:

- The shared event-record parser can recover complete events from a partially-written JSON envelope instead of dropping the run to an empty state.
- Acceptance and supervision commands now reuse the same tolerant parser, reducing `supervise wait` failures caused by concurrent event writes.
- Local event writes use atomic temp-file replacement before refreshing run state.
- CLI-created and server-created run directories both initialize `logs`, `task-packets`, `uploads`, `inbox`, `handoffs`, and `evidence` subdirectories.

User-facing value:

- Foreground Codex steerers are less likely to miss rower milestone events because the ledger was read mid-write.
- `supervise wait`, watchdog review, and acceptance commands now share one event-truth parser.
- Rower runs have predictable local artifact directories from the beginning, making handoff/evidence/log collection easier to inspect and replay.

Known gaps:

- The file is still named `events.ndjson` while the current runtime format remains a JSON envelope; true append-only NDJSON is still a later migration.
- Atomic replacement reduces partial reads from DragonBoat writers, but external tooling can still write malformed ledgers if it bypasses the shared writer.

## 2026-06-10 — Crew Wave Archive And Visual Agent Identity

DragonBoat now treats the relationship graph as the current task crew, not as a dumping ground for every historical rower that ever appeared in the run.

Implemented user-facing capabilities:

- `crew.wave.started` and `crew.member.archived` events define which rowers belong to the active visible crew wave.
- `dragonboat rower start --new-wave` lets the steerer begin an unrelated new task while archiving stale rowers from the current graph projection.
- The command deck filters archived or terminal historical rowers out of the current graph, edge list, CLI shortcuts, and Agent output tabs while preserving raw run events, mailbox, evidence, terminal logs, and replay history.
- Rower cards expose a manual archive control so the human can remove irrelevant rowers from the active graph without deleting audit data.
- Chinese message mode now projects user-facing rower names from task packet display metadata, a role dictionary, or a readable fallback instead of showing only raw `snake_case` ids.
- Mailbox timeline hides long `instruction` task packet payloads by default and keeps `intent_confirmed`, peer handoff, status, review, and evidence messages as the user-facing collaboration record.
- Agent cards now use stable per-run pixel avatar assets for rowers, giving each role a visual memory point while keeping platform logos, status badges, CLI controls, and model controls readable.

User-facing value:

- A restarted or long-running session can show the crew that matters now, so old design/recovery/review rowers no longer crowd the relationship map.
- The steerer has a concrete `--new-wave` habit for separating unrelated task rounds without losing ledger history.
- Chinese-first users can understand rower occupations and task shells without decoding English ids.
- The command deck becomes closer to a live command surface: archive is a view-level act, while evidence remains local and auditable.

Known gaps:

- Wave selection is explicit and conservative; DragonBoat does not yet infer every new user intent boundary automatically.
- Manual archive hides rowers from the current graph but does not yet expose a dedicated archived-rower browser.
- Pixel avatars are static bundled assets; future versions can let the project owner curate avatar packs or role-specific art direction.
- Display metadata is recommended in task packets, but older packets still rely on role dictionaries or fallback conversion.

## 2026-06-16 — Release Readiness CLI And One-Command Deck

DragonBoat now has the first release-oriented command surface for people trying it from a normal project folder instead of from the repository demo scripts.

Implemented user-facing capabilities:

- The root package metadata is publishable as `dragonboat-crew`, exposes the `dragonboat` bin, and carries runtime files needed by the CLI and command deck.
- `dragonboat doctor` checks Node.js, git, Codex CLI, Claude Code, browser artifact permissions, the workspace bootstrap kit, local API health, and Web deck health, then prints copyable fix commands instead of leaving users with raw connection errors.
- `dragonboat doctor --deep --model <model> --effort <effort>` extends the first-run check with web-access/CDP readiness and a real Claude Code route smoke for the intended rower model.
- `dragonboat deck` starts the local API and Web command deck from one product command, installs the workspace bootstrap kit, supports explicit API/Web ports, opens the browser on request, and prints the exact environment line for foreground steering.
- `dragonboat steer --open` opens the configured command deck URL while launching the native foreground Codex CLI from the target workspace.
- `dragonboat smoke run` creates a no-token local projection run with steerer registration, one Claude rower registration, rower command start, `intent_confirmed` mailbox, evidence submission, command finish, and stopped lifecycle events.
- `dragonboat acceptance smoke` validates the minimum release loop: Codex steerer registration, one Claude rower registration, rower CLI start, intent confirmation mailbox, evidence submission, and stopped rower lifecycle.
- The README now starts with install, quickstart, adapter boundary, smoke checks, and the core product bet instead of only the long-form concept story.

User-facing value:

- New users get a one-command deck and a one-command steerer path before learning the internal demo scripts.
- Failures become actionable: missing bootstrap, dead API, dead Web deck, missing Codex, missing Claude Code, unhealthy browser/CDP setup, or broken Claude model routing each point to the next fix.
- The v0.1 promise is honest: Codex foreground steerer plus Claude Code dynamic rowers are supported now; other CLI adapters are roadmap or experimental.
- The project has a smaller public proof path for release demos and bug reports because `acceptance smoke` is lighter than the full first-crew-loop acceptance.
- Release smoke can now be generated without spending provider tokens, while `doctor --deep` remains the explicit route-health check for real Claude Code and browser-backed rowers.

Known gaps:

- The package still runs the TypeScript source through `tsx`; a later release should ship a compiled distribution to reduce install weight and startup complexity.
- `dragonboat deck` starts local processes but does not yet manage a persistent daemon registry or graceful stop command.
- Port adaptation is conservative when the user explicitly passes ports; future versions should surface port conflicts through doctor/deck without surprising overrides.
- Deep doctor can consume one small Claude Code route check; the quick doctor remains the low-cost default.
- No-token smoke validates ledger/deck projection and coordination events, not semantic quality or real provider execution; Evidence Gate, Claim Ledger, and `doctor --deep` remain the higher bar for real work.

## 2026-06-16 — Open Source P1 Story And Example Pack

DragonBoat now has a clearer public-release story for first-time users who need to understand the product before they understand the internals.

Implemented user-facing capabilities:

- `create-dragonboat` is packaged as a scaffold-style alias for workspace initialization, alongside the existing `dragonboat init` command.
- The README now opens with the concrete one-sentence promise: a local-first command deck that lets Codex steer Claude Code workers with task packets, mailbox handoffs, and evidence gates.
- The README first screen includes a command-deck overview asset, a five-line Quick Start, and explicit sections for What You Get, When To Use It, and Why It Matters.
- `docs/model-routing.md` explains the steerer/rower routing economics, multimodal routing expectations, and why evidence gates are part of cost control.
- `docs/security-and-privacy.md` explains what DragonBoat writes locally, where run logs live, how rower worktrees behave, and what sensitive-data risks remain.
- `examples/mini-fullstack`, `examples/research-review`, and `examples/ui-qa` provide task prompts, expected crew plans, screenshot-style command-deck previews, and tiny replay ledgers for the three launch demo categories.
- The Web command deck release surface now keeps the first glance focused on crew graph, Agents group chat, Agent output, and evidence while moving Workflow and raw event-stream details into an Advanced debug section.

User-facing value:

- A new user can understand the pain, install path, supported adapter boundary, and first proof loop without reading architecture docs first.
- Launch demos have reusable scripts and expected crew plans instead of relying on the project owner to narrate every scenario live.
- The public story explains when not to use a crew, which is essential to making DragonBoat feel honest rather than over-automated.
- Security and privacy expectations are explicit before users point agentic CLIs at real projects.

Known gaps:

- The overview image is a lightweight schematic, not a captured product GIF; the launch page should still add a real short screencast once the final UI is stable.
- Examples are smoke-sized and explanatory; they are not yet executable golden fixtures wired into an example runner.
- `create-dragonboat` initializes the workspace but does not yet launch an interactive wizard.
- The Web deck Advanced section is a first release polish step; a stronger future UI should add a dedicated archived-run browser and claim-ledger summary.

## 2026-06-16 — Open Source Contributor Surface

DragonBoat now has the first contributor-facing shell needed for a public repository instead of only a local demo.

Implemented user-facing capabilities:

- `CONTRIBUTING.md` now explains the contribution bar for a local-first multi-agent coordination layer: small evidence-backed changes, adapter boundary discipline, security caution, and command-deck screenshots for UI changes.
- GitHub issue templates now separate reproducible bug reports from feature proposals, with fields for DragonBoat area, reproduction commands, sanitized output, environment, proof path, and privacy confirmation.
- Package metadata now points npm users to the public repository, issue tracker, homepage, Node.js engine requirement, and publishable docs/examples.
- The npm package file list now keeps runtime source, docs, schemas, examples, assets, and bins while excluding test files and internal planning folders from the published tarball.
- The repository now includes a minimal GitHub Actions CI workflow for pull requests and release branches, running Node 22, `npm ci`, `npm run demo:test`, `npm run demo:build`, and `git diff --check`.
- The README now links first-time contributors to the contribution guide and asks feature proposals to explain how the capability would prove coordination value.

User-facing value:

- Early adopters have a structured path for reporting failures in init, deck startup, steerer/rower behavior, mailbox, evidence, model routing, browser rowers, and local ledgers.
- Adapter ideas are framed as proof-driven product proposals rather than vague provider requests.
- The project presents itself as an open-source tool with contribution norms, not only a private command-deck prototype.

Known gaps:

- Contributor automation is still minimal; future releases should add release publishing, artifact upload, and example-run validation once the publish branch is stable.
- The runtime package still ships TypeScript source through `tsx`; a later build pipeline should emit compiled JS for a slimmer and faster install.

## 2026-06-18 — Bilingual Launch README And Public Repository Target

DragonBoat now has a launch-facing bilingual README and repository metadata aligned to the public GitHub target.

Implemented user-facing capabilities:

- The root README now opens with Chinese product positioning, screenshots, a 60-second quickstart, use cases, release checks, and core concepts, while preserving the full English story below it.
- Package metadata, issue template links, and public repository references now point to `lorinefeng/dragonboat-crew`.
- The README keeps real command-deck screenshots in the first screen so new users can immediately see the crew graph, onboarding state, Agents group chat, and rower output surfaces.

User-facing value:

- Chinese readers can understand DragonBoat's product promise before reading implementation details.
- English-speaking open-source users still get the full install, architecture, adapter boundary, and contribution story in the same document.
- The public repository target is now consistent across npm metadata, README narrative, and GitHub issue surfaces.

Known gaps:

- The GitHub repository still needs authenticated creation/push from the release machine.
- Future README iterations should add a short GIF once the command deck replay export is stable enough for public launch media.

## 2026-06-16 — First-Run Terminal Onboarding

DragonBoat now treats the empty command deck as an onboarding surface instead of pretending the browser can create a foreground Codex steerer session.

Implemented user-facing capabilities:

- The Web command deck no longer renders the misleading `New session` control when there are no local runs.
- The empty state now explains that DragonBoat sessions are created from the user's project terminal, then shows a copyable `dragonboat steer` command with the current API and Web URLs.
- The left session rail shows a short hint when no runs exist, making the empty state intentional rather than broken.
- The demo API now scopes its run store to `DRAGONBOAT_WORKSPACE_ROOT` and exposes `/api/health` with the configured workspace root, so `dragonboat deck --workspace <path>` does not accidentally reuse a stale API from another workspace.
- API process reuse now checks workspace identity before accepting an existing port listener as healthy.

User-facing value:

- First-time users get a clear "open terminal here" path instead of clicking a browser-only button that cannot launch native Codex.
- Empty command decks no longer surface raw `Internal Server Error` as the primary product state.
- Decks started for temporary examples, external workspaces, or release smoke runs are less likely to show sessions from the DragonBoat development workspace.

Known gaps:

- The browser still does not provide a copy-to-clipboard button for the recommended command; users can copy the visible snippet manually.
- Long-running API/Web processes still need a cleaner stop command and daemon registry.
- Browser-based QA can be blocked by local browser security policy; CLI tests, build checks, and smoke acceptance remain the reliable automated gate.

## 2026-06-16 — Public Release Surface Check

DragonBoat now has a static release-readiness check for the public package surface, separate from runtime doctor and crew smoke checks.

Implemented user-facing capabilities:

- `dragonboat release check` verifies that the package root contains the expected README story, install bins, public docs, schemas, examples, command-deck overview asset, and first-run Web deck UI strings.
- `dragonboat release check --format json` emits a machine-readable report for CI, steerer review, or pre-publish automation.
- The README release smoke section now starts with `dragonboat release check`, then moves to workspace health, provider/browser readiness, no-token smoke, and acceptance checks.

User-facing value:

- Maintainers can prove the release package still contains the public onboarding story and example pack before asking users to install it.
- Static package completeness is separated from local runtime health, which makes failures easier to understand for new contributors.
- The command gives future release automation a small, deterministic gate that does not start services, spend tokens, or mutate user workspaces.

Known gaps:

- The release check is intentionally static; it does not replace `dragonboat doctor`, `dragonboat smoke run`, or real provider/browser route validation.
- The example packs are checked for presence, not yet replayed as executable golden fixtures.

## 2026-06-17 — Public README Screenshots And Smoke Deck Import

DragonBoat now treats public launch screenshots as release evidence, not decoration.

Implemented user-facing capabilities:

- The root README first screen now uses a real command-deck screenshot from a no-token smoke run instead of only the schematic SVG.
- The root README now includes a copyable 60-second quickstart: global install, `dragonboat deck --open`, `dragonboat steer --open`, and a first prompt for the foreground Codex steerer.
- `docs/assets/dragonboat-empty-onboarding.png` captures the empty first-run state where the Web deck tells users to launch the foreground Codex steerer from a project terminal.
- `docs/assets/dragonboat-smoke-crew-graph.png` captures the live crew graph with a Codex steerer, one Claude release-smoke rower, edge count, CLI shortcuts, and the lower Agents group chat / output surfaces.
- `docs/assets/dragonboat-smoke-group-chat-output.png` captures the Agents group chat, evidence queue, claim area, and readable Agent output from a validated smoke run.
- The demo-web README now documents the current architecture: Web deck, Hono API, foreground Codex steerer, dynamic Claude rowers, local run ledgers, smoke run, and reconcile flow.
- `dragonboat release check` now requires the real PNG screenshots in addition to the schematic overview asset.
- The session store can now discover and activate a run created by the CLI after the Web API has already started, so `dragonboat smoke run` followed by `dragonboat run reconcile` can project into an open deck.
- `dragonboat deck` now distinguishes explicit port conflicts from reusable DragonBoat services: explicit ports occupied by unrelated services fail with an actionable message, while default ports can automatically move to the next free port.
- `docs/release-checklist.md` now defines what belongs in the npm package, what may remain GitHub-only, and what must stay private or ignored before public launch.

User-facing value:

- New users can see the actual product before installing or running a real model-backed crew.
- The public README now demonstrates the three surfaces that matter most for DragonBoat's positioning: crew graph, Agents group chat, and readable rower output.
- Release demos can be generated from a no-token smoke run and then reconciled into a running deck, which is safer for documentation and issue reproduction.
- The deck no longer depends on API restart timing to see a locally created smoke run.
- First-run port conflicts are less likely to produce fake "started" URLs or broken browser pages.
- Maintainers now have a concrete pre-publish checklist for keeping local run ledgers, worktrees, private prompts, and temporary artifacts out of the first public release.

Known gaps:

- The screenshots are static PNGs; a short GIF or MP4 walkthrough would still explain the foreground Codex + Web deck split better.
- The release screenshot smoke is no-token and proves projection, not real provider execution or semantic quality.
- The API/Web process lifecycle still needs a first-class stop/status command before the public release feels fully one-command managed.
