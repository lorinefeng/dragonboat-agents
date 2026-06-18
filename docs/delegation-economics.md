# Delegation Economics v0

DragonBoat should not claim that an agent team is always better than a single strong agent. The product claim is narrower and more useful:

> For high-fit tasks, DragonBoat can amortize one expensive global understanding pass across cheaper rowers, run independent slices in parallel, and make results reviewable through evidence.

Delegation Economics v0 turns that claim into a local workflow: score the task, seal the task packet, gate the evidence, then record the benchmark.

## Delegation Fit Score

The steerer scores seven fields from `0` to `3`.

Positive fields:

- `context_amortization`: whether one global scan can be reused by rowers.
- `parallel_split`: whether two or more slices can move independently.
- `interface_stability`: whether boundaries can be written as contracts, file scopes, or API surfaces.
- `acceptance_executability`: whether completion can be checked by commands, assertions, screenshots, events, or scripts.
- `low_cost_rower_fit`: whether lower-cost rowers can do most execution while the steerer plans and reviews.

Penalty fields:

- `shared_state_penalty`: how much the task depends on one shared runtime, UI surface, or small code area.
- `runtime_drift_penalty`: how likely old processes, hook state, ports, or active sessions can make evidence misleading.

Calculation:

```text
fit_score =
  context_amortization
  + parallel_split
  + interface_stability
  + acceptance_executability
  + low_cost_rower_fit
  - shared_state_penalty
  - runtime_drift_penalty
```

Decision:

- `fit_score >= 11`: `crew_strong_fit`
- `fit_score 8..10`: `crew_candidate`
- `fit_score <= 7`: `single_agent_default`

Hard blockers always force `single_agent_default`, even when the numeric score is high. Typical hard blockers:

- no machine-checkable acceptance path
- tiny UI/state fix in one or two files
- success depends on the current foreground Codex hook/session state
- frontend/API/dev-server version alignment has not been confirmed
- expected fix time is lower than crew handoff/evidence overhead
- the task cannot be sealed and would force rowers to rediscover the whole repository

## Sealed Task Packet v1

A sealed task packet does not ban thinking. It bans shifting context-discovery cost to rowers.

The packet must include:

- identity: agent id, role, task id, run id, workspace root
- delegation fit snapshot
- one-paragraph mission
- sealed inputs
- allowed paths
- forbidden scope
- acceptance checks
- evidence requirements
- escalation rules

If a rower needs to leave the sealed scope, it must mailbox the steerer instead of silently expanding the task.

## Evidence Gate v1

`evidence_submitted` means a rower produced a claim. `reviewable` means DragonBoat can start trusting that claim.

Minimum checks:

- durable mailbox or structured handoff before evidence
- recipient ack before evidence review when the handoff is ack-required
- acceptance proof before done claim
- tracked workspace visibility proof
- remaining risk disclosure

Task-specific checks:

- UI/UX tasks require screenshot paths and browser/Playwright commands.
- Runtime/hook tasks require hook installation proof plus fresh-session, `/hooks`, or continuation-event proof.
- Backend contract tasks require a contract mailbox or contract artifact.

Structured handoffs are the preferred peer delivery format for substantive work. A handoff should carry `summary`, `claims`, `sources`, `confidence`, `open_questions`, and `required_action`, so the recipient can consume a compact delivery object instead of re-reading a long narrative report. When a handoff is ack-required, `evidence gate` keeps the evidence rejected until the recipient records `handoff ack`.

## Benchmark Harness v0

The benchmark record compares solo and crew runs by economics and acceptance, not vibes.

Core fields:

- identity: benchmark id, task name, task class, run id, workspace root, date
- execution mode: `single_agent` or `crew`
- predicted fit score and blockers
- rower count, mailbox count, evidence count, blocker count, false-done count
- premium token ratio and total tokens when available
- wall-clock time
- outcome: `pass`, `partial`, or `fail`
- economics verdict: `crew_better`, `solo_better`, or `inconclusive`

When providers do not expose tokens, DragonBoat should still record proxy metrics such as files read, context bundle count, and turn count in later versions.

## CLI Workflow

Assess fit:

```sh
.dragonboat/bin/dragonboat delegate assess \
  --context-amortization 3 \
  --parallel-split 3 \
  --interface-stability 3 \
  --acceptance-executability 3 \
  --low-cost-rower-fit 3 \
  --shared-state-penalty 0 \
  --runtime-drift-penalty 1 \
  --format markdown
```

Generate a sealed packet:

```sh
.dragonboat/bin/dragonboat delegate packet \
  --agent agent_backend \
  --role backend \
  --task task_delegation_backend \
  --mission "Implement the backend contract." \
  --fit .dragonboat/delegation-fit.json \
  --input docs/delegation-economics.md \
  --allowed-path "apps/demo-web/src/shared/**" \
  --acceptance "npm run demo:test" \
  --out .dragonboat/task-packets/agent_backend.md
```

Gate evidence:

```sh
.dragonboat/bin/dragonboat evidence gate --agent agent_backend --task task_backend --task-type backend_contract
```

Submit and consume a structured handoff:

```sh
.dragonboat/bin/dragonboat handoff submit \
  --from agent_backend \
  --to agent_frontend \
  --task task_backend \
  --summary "Backend contract ready for frontend consumption." \
  --claim "The API response shape is stable for frontend wiring." \
  --source .dragonboat/handoffs/backend_contract.md \
  --confidence high \
  --open-question "none" \
  --required-action "Frontend should wire and verify the contract." \
  --file .dragonboat/handoffs/backend_contract.md

.dragonboat/bin/dragonboat handoff ack \
  --handoff <handoffId> \
  --from agent_frontend \
  --status consumed \
  --note "Contract consumed for frontend wiring."
```

Atomically close a rower task:

```sh
.dragonboat/bin/dragonboat task complete \
  --from agent_backend \
  --to agent_frontend \
  --task task_backend \
  --handoff .dragonboat/handoffs/backend_contract.md \
  --evidence .dragonboat/evidence/backend_contract.md \
  --summary "Backend contract is ready for review." \
  --claim "Contract and tests are ready for frontend consumption." \
  --source .dragonboat/handoffs/backend_contract.md \
  --confidence high \
  --open-question "none" \
  --required-action "Frontend should consume and ack." \
  --command "npm run demo:test" \
  --workspace-proof "git status --short shows tracked workspace visibility" \
  --risk "none"
```

Record and compare benchmarks:

```sh
.dragonboat/bin/dragonboat benchmark record --latest --mode crew --task-name "Context Bundle v1" --task-class context_bundle --benchmark-id bench_context_bundle_crew
.dragonboat/bin/dragonboat benchmark compare --solo .dragonboat/benchmarks/bench_solo.json --crew .dragonboat/benchmarks/bench_crew.json
```

Read the shared fact board and send an incremental delta:

```sh
.dragonboat/bin/dragonboat fact board --latest --format markdown
.dragonboat/bin/dragonboat context delta --to agent_frontend --since 120 --latest --format markdown
```

## Native Benchmark Metrics

Benchmark records now distinguish hard telemetry from softer planning estimates.

Hard telemetry fields:

- `team_wall_clock_seconds`: elapsed time from the first rower `command.started` to the last rower `command.finished`.
- `serial_lower_bound_seconds`: sum of each rower's measured command runtime, used as the conservative serial baseline.
- `hard_telemetry_seconds`: alias for the hard team wall-clock value used in reports.
- `confidence_level`: `high` when rower command start/finish telemetry exists, `medium` when only coarse timing exists, and `low` when timing is absent.

Soft estimate fields:

- `rower_self_estimate_seconds`: sum of rower-provided single-agent estimates when they exist.
- `soft_estimate_seconds`: the planning estimate used for non-telemetry comparisons.

DragonBoat should cite hard telemetry first. Rower self-estimates are useful for planning, but they are not proof of economic value unless compared against a reproducible solo baseline.

## Shared Fact Board And Context Delta

Crew outputs should converge into a shared truth surface before synthesis.

- `confirmed_facts`: sourced claims that another agent or the steerer reviewed as supported.
- `unverified_claims`: claims that were submitted but not yet supported.
- `conflicting_claims`: refuted, conflicted, or human-needed claims.
- `missing_evidence`: rejected evidence-gate results and proof gaps.
- `pending_handoffs`: ack-required structured handoffs that still need consumption.
- `accepted_conclusions`: steerer or workflow conclusions accepted for synthesis.

Use `context delta` when a rower is already alive and only needs what changed since a known sequence number. This reduces repeated context loading and keeps agents aligned on the newest facts, conflicts, open questions, and artifact paths.

## Task Fit Examples

Crew-fit DragonBoat tasks:

- mailbox expectation tracker and evidence gate hardening
- context bundle schema and adapter handoff improvements
- benchmark harness implementation
- acceptance gate expansion with positive and negative fixtures
- route explainability and cost audit

Single-agent-default tasks:

- one-button UI position fixes
- live dev-server drift and port confusion
- current foreground Codex hook trust/session diagnosis
- screenshot-pinpointed one-file repairs
- highly subjective product/aesthetic judgment
