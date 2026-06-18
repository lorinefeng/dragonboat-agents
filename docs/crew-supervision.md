# Crew Mission Contract And Supervision Loop v0

DragonBoat should not treat multiple rowers as independent report writers. A crew task needs one shared mission, explicit role stances, required peer interaction, and a live supervision loop that keeps the steerer aware while rowers work.

## Crew Mission Contract

Every multi-rower sealed task packet should include:

- `Shared Mission`: the common outcome all rowers serve.
- `Final Synthesis Owner`: usually `agent_codex`.
- `Role Stance`: the specific lens this rower contributes.
- `Non-Goals`: what the rower must not treat as its local finish line.
- `Required Peer Interaction`: peers that must be challenged, aligned with, or asked for counter-evidence.
- `Intent Confirmation`: the first required mailbox back to the synthesis owner.

This contract prevents a rower from optimizing a local slice that does not help the steerer synthesize one final review.

## Intent Confirmation

Before substantive work, a rower should send:

```sh
.dragonboat/bin/dragonboat message send \
  --from <agentId> \
  --to agent_codex \
  --task <taskId> \
  --type intent_confirmed \
  --body "<shared mission / stance / non-goals understood>"
```

## Peer Challenge

When the task needs multi-perspective analysis, rowers should challenge or align with peers:

```sh
.dragonboat/bin/dragonboat message send \
  --from <agentId> \
  --to <peerAgentId> \
  --task <taskId> \
  --type peer_challenge \
  --body "<claim, concern, or request for counter-evidence>"
```

Peer challenge is not required for every implementation task. It is required when the product value comes from competing perspectives, architectural review, or parallel research.

## Supervision Loop

`watchdog stop-check` is a Stop-hook bridge. It can wake a Codex turn that is about to end, but it is not live supervision after the steerer has already stopped.

For live supervision, the steerer runs:

```sh
.dragonboat/bin/dragonboat supervise wait \
  --agents agent_runtime_review,agent_product_review,agent_acceptance_review \
  --expect intent_confirmed,status,evidence \
  --timeout 900
```

The command reads the local run event ledger and waits until each listed rower has the requested milestones, a blocker appears, or the timeout is reached. It records one of:

- `supervision.wait.completed`
- `supervision.wait.timeout`
- `supervision.wait.blocked`

This keeps the foreground Codex steerer in the loop without pretending that the Stop hook is a background daemon.
