# Dynamic Workflow Readiness v0

DragonBoat should not prove value by opening as many agents as possible. Dynamic workflow support is useful only when the task shape benefits from staged fan-out, independent verification, claim tracking, and explicit cost/risk controls.

This document defines the first provider-neutral substrate for that mode.

## Product Position

Dynamic Workflow is a mode above a normal 3-5 person Agent Team.

- `single`: the foreground steerer handles a low-fit task directly.
- `subagent`: the steerer launches one isolated helper for search, verification, or a sealed local task.
- `agent_team`: 3-5 rowers work with a shared mission and peer mailbox obligations.
- `dynamic_workflow`: a staged, replayable workflow with phases, fan-out, cross-checking, synthesis, verification, and human approval gates.
- `human_approval_required`: the requested scale, cost, permissions, or risk exceeds the default safe envelope.

The default rule is conservative: small UI fixes, live hook/session debugging, and runtime drift recovery stay in `single`. Large audits, migrations, multi-source research, refutation workflows, and claim-heavy reviews can enter `dynamic_workflow`.

## Agentic Mode Router

The mode router extends Delegation Economics v0.

It still uses the Delegation Fit fields:

- `context_amortization`
- `parallel_split`
- `interface_stability`
- `acceptance_executability`
- `low_cost_rower_fit`
- `shared_state_penalty`
- `runtime_drift_penalty`

It adds task signals:

- expected agent count
- phase count
- cross-check requirement
- hidden complexity
- max concurrency
- estimated tokens
- explicit human-approval requirement

CLI:

```sh
dragonboat workflow assess \
  --context-amortization 3 \
  --parallel-split 3 \
  --interface-stability 2 \
  --acceptance-executability 2 \
  --low-cost-rower-fit 3 \
  --shared-state-penalty 1 \
  --runtime-drift-penalty 1 \
  --expected-agents 8 \
  --phase-count 4 \
  --cross-check \
  --format json
```

Events:

- `agentic.mode.assessed`
- `agentic.mode.selected`

## Workflow Plan IR

The DragonBoat workflow plan is provider-neutral. It is not a Claude Workflow script, a Codex-only prompt, or a shell-only runner.

The v0 plan contains:

- workflow id
- goal
- workspace root
- created timestamp
- max concurrency
- max total agents
- token and cost caps when known
- human approval requirement
- phases
- quality patterns
- approval gates

Default phases:

1. `discover`
2. `shard`
3. `fanout`
4. `cross_check`
5. `synthesize`
6. `verify`

Quality patterns:

- `map_reduce`
- `refuter`
- `claim_vote`
- `independent_verify`
- `fix_loop`

Default safety limits:

- `max_concurrency = 4`
- `max_total_agents = 24`

Anything larger requires explicit human approval before it is considered valid.

CLI:

```sh
dragonboat workflow draft \
  --goal "Audit message/evidence/ledger consistency" \
  --out .dragonboat/workflows/ledger-audit.json

dragonboat workflow validate --plan .dragonboat/workflows/ledger-audit.json
dragonboat workflow run --plan .dragonboat/workflows/ledger-audit.json --dry-run
dragonboat workflow run --plan .dragonboat/workflows/ledger-audit.json \
  --phase-timeout-seconds 900 \
  --phase-retries 1
```

Events:

- `workflow.plan.created`
- `workflow.phase.started`
- `workflow.phase.completed`
- `workflow.agent.spawned`
- `workflow.agent.stopped`
- `workflow.control.requested`
- `workflow.supervision.blocked`
- `workflow.acceptance.completed`

## Phase Supervision

Workflow supervision is phase-aware.

In v0, `workflow run --dry-run` records plan and phase events without launching rowers. This lets the command deck and event ledger validate workflow shape before DragonBoat starts spending model tokens.

Without `--dry-run`, `workflow run` is the first live phase runner:

- starts rower waves through the local session API
- waits for phase lifecycle events
- applies `workflow_claim` evidence gates before completing a phase
- stops stale or blocked phase agents
- retries a blocked phase when `--phase-retries` allows it
- records `workflow.acceptance.completed` only after all phases pass the submitted -> reviewable -> accepted truth chain

Manual controls:

```sh
dragonboat workflow pause --workflow <id> --reason "<why>"
dragonboat workflow resume --workflow <id> --reason "<why>"
dragonboat workflow stop --workflow <id> --reason "<why>"
```

These controls write `workflow.control.requested` events. `workflow stop` also attempts to stop active workflow rowers immediately; a running phase supervisor observes pause/resume/stop controls from the local run ledger.

## Claim Ledger

Dynamic workflows should not treat “evidence submitted” as truth. The stronger object is a claim that can be supported, refuted, conflicted, or left unresolved.

A claim contains:

- claim id
- source agent
- claim text
- source artifact, URL, file, or command
- confidence
- verification status
- verifier or refuter agent
- final synthesis inclusion

Statuses:

- `unverified`
- `supported`
- `refuted`
- `conflicted`
- `needs_human`

Events:

- `claim.submitted`
- `claim.reviewed`

CLI:

```sh
dragonboat claim submit \
  --from agent_runtime_review \
  --task task_claims \
  --claim-id claim_ledger_format \
  --claim "events.ndjson is currently a JSON envelope, not true NDJSON" \
  --source .dragonboat/handoffs/runtime.md

dragonboat claim review \
  --from agent_refuter \
  --task task_claims \
  --claim-id claim_ledger_format \
  --status supported \
  --note "Verified against the local run file"
```

Evidence Gate v2 adds `workflow_claim` checks:

- submitted claims must exist
- claims must include sources
- at least one claim must be independently reviewed
- refuted claims must not be included in final synthesis

Evidence files can also create claim ledger entries automatically when they include parser-friendly lines:

```md
- Claim: <specific claim>
- Source: <URL, command, screenshot, or file path>
```

## Command Deck Projection

The web command deck now projects a Workflow Status panel from event history.

It shows:

- current agentic mode
- active phase
- active workflow agents
- claim ledger counts
- evidence truth state: `none`, `submitted`, `reviewable`, or `accepted`
- phase status chips
- phase timeline
- agent wave history
- claim table with source/status visibility
- cost trace summary
- browser evidence projection
- pause/resume/stop control entrypoints

The existing crew graph, mailbox timeline, evidence queue, terminal mirror, and event stream remain the lower-level surfaces.

## P1 Economics And Workflow Packs

Dynamic workflow planning now connects to the practical economics layer:

- `dragonboat route budget` can choose routes using subscription health, concurrency, remaining budget, task cost cap, capability requirements, and quality-risk tolerance.
- `dragonboat capability matrix` builds Agent Skill Cards and model capability profiles from route decisions, evidence gates, and claim review outcomes.
- `dragonboat cost trace` creates a local cost/waste proxy from run events.
- `dragonboat workflow pack list|show|install|draft` provides reusable pack templates for PR review, large migration, frontend multimodal work, and security audit.
- `dragonboat benchmark suite` compares `single_agent`, `crew`, `agent_team`, and `dynamic_workflow` records with confidence instead of overclaiming from one benchmark.

These controls are not a substitute for user approval. They exist so the steerer can justify why a task should stay single-agent, use a small agent team, or become a staged workflow.

## P2 Compute And Privacy Controls

Dynamic workflows can fan out faster than a human can manually audit every route. Before using remote workers or community packs, the steerer should run the P2 control commands:

- `dragonboat compute plan` for local/remote worker placement
- `dragonboat privacy route` or `dragonboat privacy redact` before cloud routing
- `dragonboat subscription advise` before treating a paid plan as the best route
- `dragonboat marketplace list|show|install` before reusing a community pack
- `dragonboat capability learn` before trusting long-run model or agent capability assumptions

These commands emit local events that the command deck can replay:

- `compute.placement.planned`
- `privacy.route.assessed`
- `subscription.advice.generated`
- `marketplace.pack.installed`
- `capability.learning.updated`

P2 does not grant blanket permission to use remote compute. Private code, secrets, customer data, and local-only files must either stay local, be redacted, or require explicit human approval.

## Current Gaps

Dynamic Workflow Readiness v0 is a substrate, not a full production runtime.

Known gaps:

- live workflow runtime is still conservative and local-API dependent; it should be exercised with small workflows before large fan-out.
- phase retry is count-based, not yet a rich backoff policy.
- resume currently resumes by observing the latest control event; it is not a full persisted scheduler.
- the command deck shows a compact projection, not a full workflow editor.
- token and cost accounting still relies on benchmark proxies when providers do not expose usage.
- human approval is enforced by plan validation, not a full interactive approval UI.

## Why This Matters

DragonBoat’s strategic lesson is that many agents are not automatically better. A workflow becomes valuable when it can:

- route the task mode correctly
- fan out only after the work is shardable
- ask refuters to challenge claims
- exclude unsupported claims from synthesis
- pause or stop before cost and risk explode
- replay the whole plan and result afterward

This is the useful part of dynamic workflows to productize first.
