# First Crew Loop Acceptance

This checklist defines the first real DragonBoat self-iteration acceptance gate.

The goal is not to prove that a fixed demo can replay. The goal is to prove that a foreground Codex steerer can dynamically control Claude Code rowers through DragonBoat, while the local command deck records enough evidence to review what happened.

## Acceptance Command

Run this from the tracked workspace after the real crew run:

```sh
.dragonboat/bin/dragonboat acceptance first-crew-loop
```

The no-argument form is the normal path inside a foreground `dragonboat steer` session because `DRAGONBOAT_RUN_ID` is already injected.

Other supported forms:

```sh
.dragonboat/bin/dragonboat acceptance first-crew-loop --run <run_id>
.dragonboat/bin/dragonboat acceptance first-crew-loop --latest
.dragonboat/bin/dragonboat acceptance first-crew-loop --events .dragonboat/runs/<run_id>/events.ndjson
```

Fresh runs should write session state and events into the tracked workspace:

```text
.dragonboat/runs/<run_id>/state.json
.dragonboat/runs/<run_id>/events.ndjson
```

If the event file is missing but the local DragonBoat API still has the run in memory, the command falls back to `GET /api/sessions/<run_id>` and validates the returned event list. This protects an in-progress run from older server-start configurations, but fresh runs should still write workspace-local per-session event files.

The command must print:

```text
PASS first-crew-loop
```

Any `FAIL first-crew-loop` result is a blocker, even if the web command deck looks plausible.

## Required Evidence

The acceptance script verifies these event-level facts:

- Foreground Codex steerer registered as `agent_codex`.
- Dynamic rowers registered in this order: `agent_backend`, `agent_frontend`, `agent_qa_ops`.
- `task_backend`, `task_frontend`, and `task_qa_ops` task packets were created.
- Each rower has a real Claude command start event.
- `agent_backend -> agent_frontend` sent a `contract` mailbox message.
- `agent_frontend -> agent_qa_ops` sent a `status` or `review` mailbox message.
- `agent_qa_ops -> agent_codex` sent an `evidence` or `review` mailbox message.
- Each task has passed evidence submitted by its owning rower.
- Each canonical task evidence then passes `evidence.gate.checked` with `status=reviewable`.
- At least one rower was stopped by the steerer.

Mailbox handoffs are durable and must contain a non-empty body. A required message should be sent as soon as the producing rower has a useful handoff, even if the recipient rower has not been started yet. Waiting for the recipient CLI process to be live is not a valid reason to omit a required mailbox event.

Rower-originated mailbox commands must include explicit `--from <agentId>` and `--task <taskId>` flags. The DragonBoat CLI defaults are intentionally convenient for steerer-originated instructions, but they are not valid for peer handoffs required by this gate.

The canonical rower startup path also injects First Crew Loop guardrails into backend, frontend, and QA/Ops task prompts. These guardrails restate the required mailbox and evidence commands so a weak task packet is less likely to produce an unverifiable run.

Because rowers run in isolated worktrees, DragonBoat syncs `.dragonboat/handoffs/` and `.dragonboat/evidence/` files from the rower worktree back to the tracked workspace when the rower process exits. Downstream rowers should still rely on mailbox as the canonical notification, but reviewable files must be available in the workspace kit as well.

`evidence.submitted` is not enough to pass this gate. First Crew Loop now follows DragonBoat's three-layer truth model: a rower may submit evidence, the steerer or gate checker must mark it `reviewable`, and only then can the run be treated as acceptance-ready.

## Manual Review Notes

The script checks the event ledger, not code quality. The human or steerer should still review:

- the rower terminal mirror for suspicious failures or ignored prompts
- the handoff files under `.dragonboat/handoffs/`
- the evidence notes under `.dragonboat/evidence/`
- the actual code diff produced in rower worktrees
- whether any model route was unhealthy or mismatched to task capability

## Current Scope

This gate only covers the first Codex-to-Claude real crew loop. It intentionally does not yet prove:

- Advisor Channel behavior
- cross-provider context bundle portability
- replay MP4 quality
- general N-agent routing beyond the backend/frontend/QA acceptance path
